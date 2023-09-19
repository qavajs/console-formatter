module.exports = {
    default: {
        memory: {},
        paths: ['test-e2e/features/**/*.feature'],
        require: ['./test-e2e/step_definitions/custom_steps.js'],
        format: ['./src/formatter.js', 'json:test-e2e/report/report.json'],
        formatOptions: {
            console: {
                showLogs: true
            }
        }
    }
}
