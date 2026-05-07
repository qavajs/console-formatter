# Change Log

All notable changes to the "@qavajs/console-formatter" will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

:rocket: - new feature

:beetle: - bugfix

:x: - deprecation/removal

:pencil: - chore

:microscope: - experimental

## [1.2.1]
- :beetle: replaced `console.log` calls with `this.log()` to write through the formatter's configured output stream

## [1.2.0]
- :x: removed runtime dependencies (chalk, cli-table3, cli-progress, figures)
- :pencil: migrated source to TypeScript
- :pencil: compiled output moved to dist/

## [1.0.0]
- :beetle: added hours to result output

## [0.8.0]
- included retries info to total report

## [0.7.2]
- made _showProgress_ false by default

## [0.7.1]
- added _showProgress_ config option to enable/disable progress bar

## [0.7.0]
- print progress of executing tests

## [0.6.0]
- added execution time display

## [0.5.0]
- added step gherkin location
- fixed issue with identifying hook keyword

## [0.4.0]
- updated logs displaying

## [0.3.0]
- added support of named hooks

## [0.2.1]
- added step definition locations

## [0.2.0]
- added step definition locations
- added log displaying

## [0.1.2]
- fixed error with retry tag
