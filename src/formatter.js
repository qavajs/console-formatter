const { Formatter, Status } = require('@cucumber/cucumber');
const chalk = require('chalk');
const Table = require('cli-table3');
const figures = require('figures');

class PrettyFormatter extends Formatter {
    indent = '  ';
    keywords = {
        Context: 'Given',
        Action: 'When',
        Outcome: 'Then'
    };
    statusColors = {
        [Status.PASSED]: 'green',
        [Status.FAILED]: 'red',
        [Status.SKIPPED]: 'blue',
        [Status.UNDEFINED]: 'yellowBright',
        [Status.AMBIGUOUS]: 'yellow',
        [Status.PENDING]: 'grey'
    };

    statusIcons = {
        [Status.PASSED]: '✓',
        [Status.FAILED]: '✗',
        [Status.SKIPPED]: '-',
        [Status.UNDEFINED]: '?',
        [Status.AMBIGUOUS]: '?',
        [Status.PENDING]: '?'
    };

    tableOptions = {
        chars: {
            'top': '' ,
            'top-mid': '' ,
            'top-left': '' ,
            'top-right': '',
            'bottom': '' ,
            'bottom-mid': '' ,
            'bottom-left': '' ,
            'bottom-right': '',
            'left': this.indent +'│',
            'left-mid': '',
            'mid': '' ,
            'mid-mid': '',
            'right': '│' ,
            'right-mid': '' ,
            'middle': '│'
        }
    };
    testCases = {};
    stepDefinitions = {};
    runStatus = {
        passed: 0,
        failed: 0,
        total: 0
    };
    barChartLength = 60;

    constructor(options) {
        super(options);
        options.eventBroadcaster.on('envelope', this.processEnvelope.bind(this));
        this.formatterOptions = options.parsedArgvOptions.console;
        this.showLogs = this.formatterOptions?.showLogs ?? false;
        this.startTimestamp = Date.now();
    }

    async processEnvelope(envelope) {
        if (envelope.stepDefinition || envelope.hook) {
            return this.readStepDefinition(envelope);
        }
        if (envelope.pickle) {
            return this.readPickle(envelope.pickle)
        }
        if (envelope.testCase) {
            return this.readTestCase(envelope.testCase)
        }
        if (envelope.testCaseStarted) {
            return this.startTestCase(envelope.testCaseStarted)
        }
        if (envelope.testStepFinished) {
            return this.finishStep(envelope.testStepFinished)
        }
        if (envelope.testCaseFinished) {
            return this.finishTestCase(envelope.testCaseFinished)
        }
        if (envelope.testRunFinished) {
            return this.finishTestRun();
        }
    }

    readStepDefinition(stepDefinition) {
        const definition = stepDefinition.stepDefinition ?? stepDefinition.hook;
        this.stepDefinitions[definition.id] = {
            name: definition.name,
            location: definition.sourceReference.uri + ':' + definition.sourceReference.location.line
        };
    }

    readPickle(pickle) {
        this.testCases[pickle.id] = pickle;
    }

    readTestCase(testCase) {
        const pickleSteps = this.testCases[testCase.pickleId].steps;
        this.testCases[testCase.id] = this.testCases[testCase.pickleId];
        this.testCases[testCase.id].testSteps = testCase.testSteps;
        for (const step of this.testCases[testCase.id].testSteps) {
            const testStep = pickleSteps.find(ps => ps.id === step.pickleStepId);
            step.argument = testStep ? testStep.argument : undefined;
            step.stepText = testStep?.text ? testStep.text : this.hookKeyword(this.testCases[testCase.id].testSteps, step);
            const stepDefinition = this.stepDefinitions[step.hookId ?? step.stepDefinitionIds[0]];
            step.location = stepDefinition ? stepDefinition.location : ''
        }
    }

    startTestCase(testCase) {
        this.testCases[testCase.id] = this.testCases[testCase.testCaseId];
    }

    finishStep(testStep) {
        const step = this.testCases[testStep.testCaseStartedId].testSteps.find(s => s.id === testStep.testStepId);
        if (step) {
            step.testStepResult = testStep.testStepResult;
        }
    }

    finishTestRun() {
        const duration = new Date(Date.now() - this.startTimestamp);
        const passRate = this.runStatus.passed / this.runStatus.total;
        const failRate = this.runStatus.failed / this.runStatus.total;
        console.log(
            chalk.green(figures.square.repeat(Math.round(passRate * this.barChartLength))) +
            chalk.red(figures.square.repeat(Math.round(failRate * this.barChartLength)))
        );
        console.log(`Passed: ${this.runStatus.passed} (${Math.round(passRate * 10000) / 100}%)`);
        console.log(`Failed: ${this.runStatus.failed} (${Math.round(failRate * 10000) / 100}%)`);
        console.log(`Total: ${this.runStatus.total} (${duration.getMinutes()}m ${duration.getSeconds()}s)`);
    }

    finishTestCase(testCase) {
        if (testCase.willBeRetried) return
        const result = this.eventDataCollector.getTestCaseAttempt(testCase.testCaseStartedId);
        const tc = this.testCases[testCase.testCaseStartedId];
        tc.testSteps.forEach(step => {
            step.gherkinLocation = this.stepGherkinLocation(step, result);
            step.logs = result.stepAttachments[step.id]?.filter(attachment => attachment.mediaType === 'text/x.cucumber.log+plain') ?? [];
        });
        this.updateRunStatus(tc);
        const lines = [];
        if (tc.tags.length > 0) {
            lines.push(chalk.cyan(tc.tags.map(tag => tag.name).join(' ')));
        }
        lines.push(chalk.magenta('Scenario: ') + tc.name);
        lines.push(...tc.testSteps.map(step => this.drawStep(step)));
        lines.push('');
        console.log(lines.join('\n'))
    }

    drawStep(step) {
        let line = this.indent + chalk.bold(this.statusIcons[step.testStepResult.status]) + ' ' + step.stepText;
        line += ` ${chalk.gray(step.gherkinLocation)}${chalk.gray(step.location)}`;
        if (step.argument && step.argument.dataTable) {
            line += `\n${this.drawDataTable(step.argument.dataTable)}`
        }
        if (step.argument && step.argument.docString) {
            line += `\n${this.drawDocString(step.argument.docString)}`;
        }
        if ([Status.FAILED, Status.AMBIGUOUS].includes(step.testStepResult.status)) {
            line += `\n${this.indent + step.testStepResult.message}`;
        }
        if (this.showLogs) {
            for (const log of step.logs) {
                line += chalk.reset(`\n${this.indent}LOG: ${log.body}`);
            }
        }
        return chalk[this.statusColors[step.testStepResult.status]](line)
    }

    drawDataTable(dataTable) {
        const table = new Table(this.tableOptions);
        table.push(...dataTable.rows.map(row => row.cells.map(cell => cell.value)));
        return table.toString();
    }

    drawDocString(docString) {
        const lines = [this.indent + '"""'];
        lines.push(...docString.content.split('\n').map(line => this.indent + line));
        lines.push(this.indent + '"""');
        return lines.join('\n')
    }

    updateRunStatus(testCase) {
        this.runStatus.total++;
        if (testCase.testSteps.every(step => step.testStepResult.status === Status.PASSED)) {
            this.runStatus.passed++
        } else {
            this.runStatus.failed++
        }
    }

    hookKeyword(steps, testStep) {
        const hook = this.stepDefinitions[testStep.hookId];
        if (hook.name) return hook.name
        const hookIndex = steps.findIndex(element => element.hookId === testStep.hookId);
        return steps.slice(0, hookIndex).some(element => element.pickleStepId) ? 'After' : 'Before'
    }

    stepGherkinLocation(step, scenario) {
        if (step.pickleStepId) {
            const [ scenarioPickleId ] = scenario.pickle.astNodeIds;
            const pickle = scenario.pickle.steps.find(e => e.id === step.pickleStepId);
            const [ astNodeId] = pickle.astNodeIds;
            const children = scenario.gherkinDocument.feature.children;
            const scenarioSource = children.find(child => child.scenario?.id === scenarioPickleId);
            const backgroundSource = children.find(child => child.background);
            const stepsSources = [].concat(scenarioSource?.scenario?.steps).concat(backgroundSource?.background?.steps).filter(x => x);
            const stepSource = stepsSources.find(s => s.id === astNodeId);
            return stepSource ? `${scenario.gherkinDocument.uri}:${stepSource.location.line} ` : '';
        }
        return '';
    }

}

module.exports = PrettyFormatter
