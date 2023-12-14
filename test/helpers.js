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


async function requestCreateUser(post){
    if (!requestCreateUser.userCount) requestCreateUser.userCount=1;
    const testUser = {email: `user${requestCreateUser.userCount++}1sdft@email.com`, password: 'yolo2MyBo!z'};
    return post('user/create', testUser).then(res=>{
        if (res.statusCode!==201) throw "Error creating user for test";
        const emailSplit = mockNodemailer.sent[mockNodemailer.sent.length-1].text.split(' ');
        const verifyCode = emailSplit[emailSplit.length-1];
        return post('user/verifyemail', {email: testUser.email, verifyCode: verifyCode});
    }).then(res=>{
        if (res.statusCode!==200) throw "Error verifying user for tests";
        return res.body.accessToken;
    }).catch(why=>{
        console.error("failed in createUser", why);
    });
}



module.exports={requestHelper, closeKnex, waitForKnex, requestCreateUser, getKnex, waitForKnexPromise};