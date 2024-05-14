const apiPort = process.env.API_PORT || 4001;
const devicePort = process.env.API_DEV_PORT || 4004;

for (const a of process.argv) {
        if (a.toLowerCase().trim() === '-sqlite') process.env.FORCE_SQLITE=true;
}

const {app, deviceServer} = require('./app.js');


app.listen(apiPort, () => {
        console.log('App listening on '+apiPort)
});


deviceServer.listen(devicePort, function() {
        console.log(`Device server listening on port ${devicePort}`);
});