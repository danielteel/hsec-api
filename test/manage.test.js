const {mockNodemailer} = require('./mocks/nodemailer');
const {app} = require('../app.js');
const request = require('supertest')(app);
const path = require('path');
const fs=require('fs');


const {waitForKnex, closeKnex, requestHelper, getKnex} =require('./helpers');
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');

const {getHash}=require('../common/common');


let knex = null;



const testUnverifiedUser = {email:'unverified@test.com', roleName: 'unverified', password: 'password', pass_hash: getHash('password')};
const testMemberUser = {email:'view@test.com', roleName: 'member', password: 'password', pass_hash: getHash('password')};
const testManagerUser = {email:'manage@test.com', roleName: 'manager', password: 'password', pass_hash: getHash('password')};
const testAdminUser={email:'admin@test.com', roleName:'admin', password: 'adminpass', pass_hash: getHash('password')};
const testUsers=[testUnverifiedUser, testMemberUser, testManagerUser, testAdminUser];

async function insertUsers(db){
    const roles = await db('roles').select('*');

    function getRoleId(name){
        return roles.find(r => r.rolename===name).id;
    }

    for (const user of testUsers){
        user.pass_hash=getHash(user.password);
        user.role_id = getRoleId(user.roleName);
        const [result] = await db('users').insert({email: user.email, pass_hash: user.pass_hash, role_id: user.role_id}).returning('*');
        user.id = result.id;

        await post('user/login', user, (res)=>{
            user.cookies=res.headers['set-cookie'];
        }); 
    }
}

beforeAll( done => {
    waitForKnex(async ()=>{
        knex = getKnex();
        await insertUsers(knex);
        done();
    });
})

afterAll( () => {
    return closeKnex();
});



describe("Cam", () => {

    it('GET /manage/unverified returns unverified users for manager and admin roles', async (done)=>{
        await get('manage/unverified', {}, async (res)=>{
            expect(res.body).toEqual([{user_id: testUnverifiedUser.id, email: testUnverifiedUser.email}]);
            expect(res.statusCode).toEqual(200);
        }, testUnverifiedUser.cookies);
        done();
    });
});