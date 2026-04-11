# @qavajs/console-formatter

Console formatter for @qavajs and cucumberjs frameworks.

### Installation
```
npm install @qavajs/console-formatter
```

Add `@qavajs/console-formatter` to the `format` property and configure it via `formatOptions`:

```typescript
export default {
    format: ['@qavajs/console-formatter'],
    formatOptions: {
        console: {
            showLogs: true,     // print this.log() entries below each step. Default: false
            showProgress: false // show progress bar during execution. Default: false
        }
    }
}
```

Or pass via CLI:

```
--format @qavajs/console-formatter
```

![](assets/report_example.png)
