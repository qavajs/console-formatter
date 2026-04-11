import { Formatter, Status, IFormatterOptions } from '@cucumber/cucumber';
import * as messages from '@cucumber/messages';
import { ITestCaseAttempt } from '@cucumber/cucumber/lib/formatter/helpers/event_data_collector';

const ANSI_CODES: Record<string, string> = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellowBright: '\x1b[93m',
  yellow: '\x1b[33m',
  grey: '\x1b[90m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

/** Wrap text in an ANSI foreground colour; resets foreground only so bold is preserved. */
function colorize(colorName: string, text: string): string {
  if (!text) return '';
  const code = ANSI_CODES[colorName];
  return code ? `${code}${text}\x1b[39m` : text;
}

/** Wrap text in bold; uses the SGR bold-off code so it doesn't disrupt surrounding colour. */
function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

/**
 * Renders a 2-D string array as a bordered table using the same border style
 * as the original cli-table3 configuration:
 *   no top/bottom borders, left = "  │", right = "│", cell divider = "│"
 */
function renderTable(rows: string[][], indent: string): string {
  if (rows.length === 0) return '';
  const numCols = Math.max(...rows.map(r => r.length));
  const colWidths = Array.from({ length: numCols }, (_, i) =>
    Math.max(...rows.map(row => (row[i] ?? '').length))
  );
  return rows
    .map(row =>
      `${indent}│ ${row.map((cell, i) => cell.padEnd(colWidths[i])).join(' │ ')} │`
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Simple progress bar (replaces cli-progress)
// ---------------------------------------------------------------------------

class ProgressBar {
  private total = 0;
  private current = 0;

  constructor(private readonly barSize: number) { }

  start(total: number, current: number): void {
    this.total = total;
    this.current = current;
  }

  setTotal(total: number): void {
    this.total = total;
    this.render();
  }

  increment(amount = 1): void {
    this.current += amount;
    this.render();
  }

  stop(): void {
    process.stdout.write('\n');
  }

  private render(): void {
    if (this.total === 0) return;
    const ratio = this.current / this.total;
    const filled = Math.round(ratio * this.barSize);
    const empty = this.barSize - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty); // █ ░
    process.stdout.write(`\r  [${bar}] ${this.current}/${this.total}  `);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConsoleFormatterOptions {
  showLogs?: boolean;
  showProgress?: boolean;
}

interface StepDefinitionEntry {
  name?: string;
  location: string;
}

interface EnrichedStep {
  id: string;
  hookId?: string;
  pickleStepId?: string;
  stepDefinitionIds: readonly string[];
  argument?: messages.PickleStepArgument;
  stepText: string;
  location: string;
  gherkinLocation?: string;
  logs?: messages.Attachment[];
  testStepResult?: messages.TestStepResult;
}

interface EnrichedTestCase {
  id: string;
  name: string;
  tags: readonly messages.PickleTag[];
  steps: readonly messages.PickleStep[];
  astNodeIds: readonly string[];
  testSteps: EnrichedStep[];
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

class PrettyFormatter extends Formatter {
  private readonly indent = '  ';

  private readonly statusColors: Record<string, string> = {
    [Status.PASSED]: 'green',
    [Status.FAILED]: 'red',
    [Status.SKIPPED]: 'blue',
    [Status.UNDEFINED]: 'yellowBright',
    [Status.AMBIGUOUS]: 'yellow',
    [Status.PENDING]: 'grey',
  };

  private readonly statusIcons: Record<string, string> = {
    [Status.PASSED]: '✓',
    [Status.FAILED]: '✗',
    [Status.SKIPPED]: '-',
    [Status.UNDEFINED]: '?',
    [Status.AMBIGUOUS]: '?',
    [Status.PENDING]: '?',
  };

  private pickles: Record<string, messages.Pickle> = {};
  private testCases: Record<string, EnrichedTestCase> = {};
  private stepDefinitions: Record<string, StepDefinitionEntry> = {};

  private runStatus = { passed: 0, failed: 0, total: 0, totalWithRetries: 0 };

  private readonly barChartLength = 60;
  private totalTestCases = 0;
  private readonly showLogs: boolean;
  private readonly showProgress: boolean;
  private readonly startTimestamp: number;
  private progressBar?: ProgressBar;

  constructor(options: IFormatterOptions) {
    super(options);
    options.eventBroadcaster.on('envelope', this.processEnvelope.bind(this));

    const formatterOptions =
      (options.parsedArgvOptions as { console?: ConsoleFormatterOptions }).console;
    this.showLogs = formatterOptions?.showLogs ?? false;
    this.showProgress = formatterOptions?.showProgress ?? false;
    this.startTimestamp = Date.now();

    if (this.showProgress) {
      this.progressBar = new ProgressBar(this.barChartLength);
    }
  }

  // -----------------------------------------------------------------------
  // Envelope routing
  // -----------------------------------------------------------------------

  async processEnvelope(envelope: messages.Envelope): Promise<void> {
    if (envelope.testRunStarted) return this.startTestRun();
    if (envelope.stepDefinition || envelope.hook)
      return this.readStepDefinition(envelope);
    if (envelope.pickle) return this.readPickle(envelope.pickle);
    if (envelope.testCase) return this.readTestCase(envelope.testCase);
    if (envelope.testCaseStarted) return this.startTestCase(envelope.testCaseStarted);
    if (envelope.testStepFinished) return this.finishStep(envelope.testStepFinished);
    if (envelope.testCaseFinished) return this.finishTestCase(envelope.testCaseFinished);
    if (envelope.testRunFinished) return this.finishTestRun();
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  startTestRun(): void {
    if (this.showProgress) {
      this.progressBar!.start(0, 0);
    }
  }

  readStepDefinition(envelope: messages.Envelope): void {
    if (envelope.stepDefinition) {
      const def = envelope.stepDefinition;
      this.stepDefinitions[def.id] = {
        location: `${def.sourceReference?.uri ?? ''}:${def.sourceReference?.location?.line ?? ''}`,
      };
    } else if (envelope.hook) {
      const hook = envelope.hook;
      this.stepDefinitions[hook.id] = {
        name: hook.name,
        location: `${hook.sourceReference?.uri ?? ''}:${hook.sourceReference?.location?.line ?? ''}`,
      };
    }
  }

  readPickle(pickle: messages.Pickle): void {
    this.pickles[pickle.id] = pickle;
  }

  readTestCase(testCase: messages.TestCase): void {
    this.totalTestCases++;
    const pickle = this.pickles[testCase.pickleId];

    const enrichedSteps: EnrichedStep[] = [...testCase.testSteps].map(step => {
      const pickleStep = pickle.steps.find(ps => ps.id === step.pickleStepId);
      const stepDefinition = this.stepDefinitions[step.hookId ?? (step.stepDefinitionIds?.[0] ?? '')];
      return {
        id: step.id,
        hookId: step.hookId,
        pickleStepId: step.pickleStepId,
        stepDefinitionIds: step.stepDefinitionIds ?? [],
        argument: pickleStep?.argument,
        stepText: pickleStep?.text ?? this.hookKeyword([...testCase.testSteps], step),
        location: stepDefinition?.location ?? '',
      };
    });

    this.testCases[testCase.id] = {
      id: pickle.id,
      name: pickle.name,
      tags: pickle.tags,
      steps: pickle.steps,
      astNodeIds: pickle.astNodeIds,
      testSteps: enrichedSteps,
    };
  }

  startTestCase(testCaseStarted: messages.TestCaseStarted): void {
    this.testCases[testCaseStarted.id] = this.testCases[testCaseStarted.testCaseId];
  }

  finishStep(testStepFinished: messages.TestStepFinished): void {
    const step = this.testCases[testStepFinished.testCaseStartedId]?.testSteps
      .find(s => s.id === testStepFinished.testStepId);
    if (step) {
      step.testStepResult = testStepFinished.testStepResult;
    }
  }

  finishTestCase(testCaseFinished: messages.TestCaseFinished): void {
    this.runStatus.totalWithRetries++;
    if (testCaseFinished.willBeRetried) return;

    const result = this.eventDataCollector.getTestCaseAttempt(testCaseFinished.testCaseStartedId);
    const tc = this.testCases[testCaseFinished.testCaseStartedId];

    tc.testSteps.forEach(step => {
      step.gherkinLocation = this.stepGherkinLocation(step, result);
      step.logs = result.stepAttachments[step.id]
        ?.filter(a => a.mediaType === 'text/x.cucumber.log+plain') ?? [];
    });

    this.updateRunStatus(tc);

    const lines: string[] = [''];
    if (tc.tags.length > 0) {
      lines.push(colorize('cyan', tc.tags.map(tag => tag.name).join(' ')));
    }
    lines.push(colorize('magenta', 'Scenario: ') + tc.name);
    lines.push(...tc.testSteps.map(step => this.drawStep(step)));
    lines.push('');
    console.log(lines.join('\n'));

    if (this.showProgress) {
      this.progressBar!.setTotal(this.totalTestCases);
      this.progressBar!.increment(1);
    }
  }

  finishTestRun(): void {
    if (this.showProgress) {
      this.progressBar!.stop();
    }
    const duration = Date.now() - this.startTimestamp;
    const passRate = this.runStatus.passed / this.runStatus.total;
    const failRate = this.runStatus.failed / this.runStatus.total;
    const SQUARE = '\u2587'; // ▇  — same as figures.square
    console.log(
      ' ' +
      colorize('green', SQUARE.repeat(Math.round(passRate * this.barChartLength))) +
      colorize('red', SQUARE.repeat(Math.round(failRate * this.barChartLength)))
    );
    console.log(`Passed: ${this.runStatus.passed} (${Math.round(passRate * 10000) / 100}%)`);
    console.log(`Failed: ${this.runStatus.failed} (${Math.round(failRate * 10000) / 100}%)`);
    console.log(`Total: ${this.runStatus.total} (with retries: ${this.runStatus.totalWithRetries})`);
    console.log(this.formatDuration(duration));
  }

  // -----------------------------------------------------------------------
  // Rendering helpers
  // -----------------------------------------------------------------------

  drawStep(step: EnrichedStep): string {
    const status = step.testStepResult?.status ?? '';
    const colorName = this.statusColors[status] ?? '';
    const icon = this.statusIcons[status] ?? '?';
    const applyColor = (text: string) => colorName ? colorize(colorName, text) : text;

    let line = `${this.indent}${applyColor(bold(icon) + ' ' + step.stepText)}`;
    line += ` ${colorize('gray', (step.gherkinLocation ?? '') + step.location)}`;

    if (step.argument?.dataTable) {
      line += `\n${this.drawDataTable(step.argument.dataTable)}`;
    }
    if (step.argument?.docString) {
      line += `\n${this.drawDocString(step.argument.docString)}`;
    }
    if (
      step.testStepResult &&
      [Status.FAILED, Status.AMBIGUOUS].includes(step.testStepResult.status)
    ) {
      line += applyColor(`\n${this.indent}${step.testStepResult.message ?? ''}`);
    }
    if (this.showLogs && step.logs) {
      for (const log of step.logs) {
        line += `\n${this.indent}LOG: ${log.body}`;
      }
    }
    return line;
  }

  drawDataTable(dataTable: messages.PickleTable): string {
    const rows = dataTable.rows.map(row => row.cells.map(cell => cell.value));
    return renderTable(rows, this.indent);
  }

  drawDocString(docString: messages.PickleDocString): string {
    const lines = [`${this.indent}"""`];
    lines.push(...docString.content.split('\n').map(l => `${this.indent}${l}`));
    lines.push(`${this.indent}"""`);
    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Status / run tracking
  // -----------------------------------------------------------------------

  updateRunStatus(testCase: EnrichedTestCase): void {
    this.runStatus.total++;
    if (testCase.testSteps.every(step => step.testStepResult?.status === Status.PASSED)) {
      this.runStatus.passed++;
    } else {
      this.runStatus.failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  hookKeyword(steps: messages.TestStep[], testStep: messages.TestStep): string {
    const hook = this.stepDefinitions[testStep.hookId ?? ''];
    if (hook?.name) return hook.name;
    const hookIndex = steps.findIndex(s => s.hookId === testStep.hookId);
    return steps.slice(0, hookIndex).some(s => s.pickleStepId) ? 'After' : 'Before';
  }

  stepGherkinLocation(
    step: Pick<EnrichedStep, 'pickleStepId'>,
    scenario: ITestCaseAttempt
  ): string {
    if (!step.pickleStepId) return '';
    const [scenarioPickleId] = scenario.pickle.astNodeIds;
    const pickleStep = scenario.pickle.steps.find(e => e.id === step.pickleStepId);
    if (!pickleStep) return '';
    const [astNodeId] = pickleStep.astNodeIds;
    const children = scenario.gherkinDocument.feature?.children ?? [];
    const scenarioSource = children.find(child => child.scenario?.id === scenarioPickleId);
    const backgroundSource = children.find(child => child.background);
    const stepsSources = [
      ...(scenarioSource?.scenario?.steps ?? []),
      ...(backgroundSource?.background?.steps ?? []),
    ];
    const stepSource = stepsSources.find(s => s.id === astNodeId);
    return stepSource
      ? `${scenario.gherkinDocument.uri ?? ''}:${stepSource.location?.line ?? ''} `
      : '';
  }

  formatDuration(ms: number): string {
    if (ms <= 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingSeconds = seconds % 60;
    const remainingMinutes = minutes % 60;
    let result = 'Duration: ';
    if (hours > 0) result += `${hours}h `;
    if (remainingMinutes > 0) result += `${remainingMinutes}m `;
    if (remainingSeconds > 0 || result === 'Duration: ') result += `${remainingSeconds}s`;
    return result.trim();
  }
}

export default PrettyFormatter;
