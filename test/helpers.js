const {getKnex} = require('../database');
const {mockNodemailer} = require('./mocks/nodemailer');

function requestHelper(request, method, endPoint, dataToSend, callback, cookies=[]){
    endPoint=endPoint;

    let resolve, reject;
    const promise = new Promise( (res, rej) => {resolve=res; reject=rej;});
    request[method]('/'+endPoint)
        .set('Cookie', cookies)
        .send(dataToSend)
        .then(res => {
            if (callback){
                resolve(callback(res));
            }else{
                resolve(res);
            }
        })
        .catch(err => {throw err});
    return promise;
}


function waitForKnex(callback){
    function checkKnex(){
        if (getKnex()){
            callback(getKnex());
        }else{
            setTimeout(checkKnex, 250);
        }
    }
    setTimeout(checkKnex, 0);
}

function waitForKnexPromise(){
    let resolveFn, rejectFn;
    const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });
    waitForKnex((knex)=>{
        resolveFn(knex);
    })
    return promise;
}

function closeKnex(){
    if (getKnex()) return getKnex().destroy();
}



module.exports={requestHelper, closeKnex, waitForKnex, getKnex, waitForKnexPromise};