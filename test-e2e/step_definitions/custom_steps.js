const { Given, When, Before, After } = require('@cucumber/cucumber');

Before(async () => {
    await new Promise(r => setTimeout(() => r(), 400));
});
Before({name: 'named before'}, () => {});
Given('background', () => {});
When('passed step', () => {});
When('failed step', () => { throw new Error('failed step') });
When('pending step', () => 'pending');
When('ambiguous step', () => {});
When('ambiguous step', () => {});
When('data table step', (dataTable) => {});
When('multiline step', (multiline) => {});

When('text attachment', function () {
    this.attach('multiline\ntext\ncontent', 'text/plain');
});

When('json attachment', function () {
    this.attach(JSON.stringify({
        property: 'value',
        nestedObject: {
            nestedObjectProperty: 'value2'
        },
        arrayProperty: [
            'val1',
            'val2',
            'val3'
        ]
    }), 'application/json');
});

When('passed step with log', function () {
    this.log('some information in passed step')
});
When('failed step with log', function () {
    this.log('some information in failed step')
    throw new Error('failed step')
});
After(() => {});
After({name: 'named after'}, () => {});
