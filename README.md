[![dev-tools.ai sdk logo](https://docs.dev-tools.ai/img/logo.svg)](https://dev-tools.ai/)

[![npm version](https://badge.fury.io/js/@devtools-ai%2Fwdio-sdk.svg)](https://badge.fury.io/js/@devtools-ai%wdio-sdk)
# SmartDriver for WebDriver.io (WDIO)

Hi, our package allow you to use visual AI for your UI tests.

It introduces two new features:
 - `browser.findByAI$('some_element_name')` : a new function that allows you to give names to elements and identify them visually. This function works in conjunction with the service's webUI for [SmartDriver](https://smartdriver.dev-tools.ai)
 - `browser.$('selector')`: the default $ function has been enhanced to collect the elements of your tests and create a visual backup. When the selector breaks because the code is different, if the UI looks the same, the service will kick in and still find your element. No more maintenance required.


To get started, visit [devtools-ai](https://dev-tools.ai) and create an account to obtain an API key.


## Setup

The setup is quite simple
```npm install @devtools-ai/wdio-sdk```

In your wdio.conf.js file add the following stanza:
```javascript
    beforeSuite: async function (suite) {
        const devtoolsai_plugin = require('@devtools-ai/wdio-sdk');
        await devtoolsai_plugin.register(suite.title);
    },
```

Finally you can configure your environment either with a .env file or with environment variables
```commandline
    export DEVTOOLSAI_API_KEY=<<your api key>>
    export DEVTOOLSAI_INTERACTIVE=TRUE # or FALSE
```

## Usage
See  [devtools-ai](https://docs.dev-tools.ai/wdio-basic-test-case) for more documentation and instructions.