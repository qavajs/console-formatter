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
    runStatus = {
        passed: 0,
        failed: 0,
        total: 0
    };
    barChartLength = 60;

    constructor(options) {
        super(options);
        options.eventBroadcaster.on('envelope', this.processEnvelope.bind(this));
    }

    async processEnvelope(envelope) {
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

    readPickle(pickle) {
        this.testCases[pickle.id] = pickle;
    }

    readTestCase(testCase) {
        this.testCases[testCase.id] = this.testCases[testCase.pickleId];
        for (const step of this.testCases[testCase.id].steps) {
            step.stepId = testCase.testSteps.find(s => s.pickleStepId === step.id).id;
        }
        delete this.testCases[testCase.pickleId];
    }

    startTestCase(testCase) {
        this.testCases[testCase.id] = this.testCases[testCase.testCaseId];
        delete this.testCases[testCase.testCaseId];
    }

    finishStep(testStep) {
        const step = this.testCases[testStep.testCaseStartedId].steps.find(s => s.stepId === testStep.testStepId);
        if (step) {
            step.testStepResult = testStep.testStepResult;
        }
    }

    finishTestRun() {
        const passRate = this.runStatus.passed / this.runStatus.total;
        const failRate = this.runStatus.failed / this.runStatus.total;
        console.log(
            chalk.green(figures.square.repeat(Math.round(passRate * this.barChartLength))) +
            chalk.red(figures.square.repeat(Math.round(failRate * this.barChartLength)))
        );
        console.log('Passed: ' + this.runStatus.passed + ' (' + passRate * 100 + '%)');
        console.log('Failed: ' + this.runStatus.failed + ' (' + failRate * 100 + '%)');
        console.log('Total: ' + this.runStatus.total);

    }

    finishTestCase(testCase) {
        const tc = this.testCases[testCase.testCaseStartedId];
        this.updateRunStatus(tc);
        const lines = [];
        if (tc.tags.length > 0) {
            lines.push(chalk.cyan(tc.tags.map(tag => tag.name).join(' ')));
        }
        lines.push(chalk.magenta('Scenario: ') + tc.name);
        lines.push(...tc.steps.map(step => this.drawStep(step)));
        lines.push('');
        console.log(lines.join('\n'))
    }

    drawStep(step) {
        let line = this.indent + chalk.bold(this.keywords[step.type] ?? '*') + ' ' + step.text;
        if (step.argument && step.argument.dataTable) {
            line += '\n' + this.drawDataTable(step.argument.dataTable)
        }
        if (step.argument && step.argument.docString) {
            line += '\n' + this.drawDocString(step.argument.docString)
        }
        if ([Status.FAILED, Status.AMBIGUOUS].includes(step.testStepResult.status)) {
            line += '\n' + this.indent + step.testStepResult.message
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
        if (testCase.steps.every(step => step.testStepResult.status === Status.PASSED)) {
            this.runStatus.passed++
        } else {
            this.runStatus.failed++
        }
    }

}

module.exports = PrettyFormatter
