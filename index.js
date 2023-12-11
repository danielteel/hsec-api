const {spawn} = require('node:child_process');

const {app} = require('./app.js');


const port = 4001;


const server = app.listen(port, () => {
        console.log('listening on '+port)
});