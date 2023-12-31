const knexFn = require('knex');


let knex = null;

function getKnex(){
    return knex;
}

function needKnex(req, res, next){
    req.knex=null;
    try {
        if (knex){
            req.knex=knex;
            return next();
        }
        return res.sendStatus(503);
    }catch (e){
        console.error('ERROR needKnex', e);
        return res.sendStatus(400);
    }
}

//singleton-ish, stores connection in global for use in other files. aka, you can only connect to one database unless I add some more codes
function connect(knexProfile, onConnect, maxAttempts=60, logOut=console.log){
    let localKnex=null;
    let attempt=0;
    
    let resolveFn, rejectFn;
    const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

    async function attemptConnection(){
        if (attempt<=maxAttempts){
            attempt++;
            try {
                localKnex = knexFn(knexProfile);
                await localKnex.raw("SELECT 1");
                if (onConnect){
                    let returned = onConnect(localKnex, attempt);
                    if (Array.isArray(returned) || returned instanceof Promise){
                        if (!Array.isArray(returned)) returned = [returned];
                        Promise.all(returned).then( () => {
                            resolveFn(localKnex);
                        })
                    }
                }else{
                    resolveFn(localKnex);
                }
                knex=localKnex;
            } catch (e) {
                logOut("attempt "+attempt+" failed to connect, trying again in a second");
                setTimeout(attemptConnection, 1000);
            }
        } else {
            rejectFn();
            throw Error("max attempt exceed for connection");
        }
    }

    attemptConnection();

    return promise;
}

module.exports = {connect, getKnex, needKnex};