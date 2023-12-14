const {mockNodemailer} = require('./mocks/nodemailer');
const {app} = require('../app.js');
const request = require('supertest')(app);
const path = require('path');
const fs=require('fs');


const {waitForKnexPromise, closeKnex, requestHelper, getKnex} =require('./helpers');
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');

const {getHash}=require('../common/common');

const {decryptAccessToken} = require('../common/accessToken');


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

beforeAll( async done => {
    knex = await waitForKnexPromise();
    await insertUsers(knex);
    process.env.CAM_DIR=path.join(__dirname,'mockfiles/');
    done();
})

afterAll( () => {
    return closeKnex();
});



describe("Cam", () => {

    it('GET /cam/file for unverified user fails to fetch', async (done)=>{
        await get('cam/123.m3u8', {}, (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);
        done();
    });

    it('GET /cam/file for member works', async (done)=>{
        const fileToGet = 'blah.m3u8';
        await get('cam/'+fileToGet, {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.text).toEqual(fs.readFileSync(path.join(__dirname,'mockfiles',fileToGet),'utf-8'));
        }, testMemberUser.cookies);
        done();
    });

    it('GET /cam/file for manager works', async (done)=>{
        const fileToGet = 'blah.m3u8';
        await get('cam/'+fileToGet, {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.text).toEqual(fs.readFileSync(path.join(__dirname,'mockfiles',fileToGet),'utf-8'));
        }, testManagerUser.cookies);
        done();
    });
    it('GET /cam/file for admin works', async (done)=>{
        const fileToGet = 'blah.m3u8';
        await get('cam/'+fileToGet, {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.text).toEqual(fs.readFileSync(path.join(__dirname,'mockfiles',fileToGet),'utf-8'));
        }, testAdminUser.cookies);
        done();
    });

    it('GET /cam/file with invalid file', async (done)=>{
        const fileToGet = 'sdfsdfklafsdk.m3u8';
        await get('cam/'+fileToGet, {}, (res)=>{
            expect(res.statusCode).toEqual(404);
        }, testAdminUser.cookies);
        done();
    });

});