# @qavajs/console-formatter

Console formatter for @qavajs and cucumberjs frameworks

### Installation
To install formatter run

`npm install @qavajs/console-formatter`

and add to formatter section in config file

```javascript
module.exports = {
    default: {
        format: ['@qavajs/console-formatter'],
        formatOptions: {
            console: {
                showLogs: true, // show this.log entries in output. Default - false
                showProgress: false // show progress bar. Default - false 
            }
        },
    }
}
```

or pass `--format @qavajs/console-formatter in cli`
             
![](assets/report_example.png)



