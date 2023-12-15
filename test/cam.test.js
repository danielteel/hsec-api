const {closeKnex, requestHelper, waitForKnexPromise} =require('./helpers');
const {getHash}=require('../common/common');
const path = require('path');
const fs=require('fs');

//Sets automatically created super user, set these before we require('../app.js') so database isnt seeded yet
process.env.SUPER_PASSWORD = "superpass";
process.env.SUPER_USERNAME = "superuser";

process.env.CAM_DIR=path.join(__dirname,'mockfiles/');

const testSuperUser =       {email: process.env.SUPER_USERNAME, password: process.env.SUPER_PASSWORD, role: 'super'};
const testUnverifiedUser =  {email:'unverified@test.com',  password: 'password',  role: 'unverified'};
const testUnverifiedUser2 = {email:'unverified2@test.com', password: 'password',  role: 'unverified'};
const testMemberUser =      {email:'view@test.com',        password: 'password',  role: 'member'};
const testMemberUser2 =     {email:'view2@test.com',       password: 'password',  role: 'member'};
const testManagerUser =     {email:'manage@test.com',      password: 'password',  role: 'manager'};
const testManagerUser2 =    {email:'manage2@test.com',     password: 'password',  role: 'manager'};
const testAdminUser =       {email:'admin@test.com',       password: 'adminpass', role: 'admin'};
const testAdminUser2 =      {email:'admin2@test.com',      password: 'adminpass', role: 'admin'};
const testUsers=[testSuperUser, testUnverifiedUser, testUnverifiedUser2, testMemberUser, testMemberUser2, testManagerUser, testManagerUser2, testAdminUser, testAdminUser2];


const {app} = require('../app.js');
const request = require('supertest')(app);
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');
let knex = null;


async function insertUsers(db){
    for (const user of testUsers){
        user.pass_hash=getHash(user.password);
        if (user.email!==process.env.SUPER_USERNAME){
            const [result] = await db('users').insert({email: user.email, pass_hash: user.pass_hash, role: user.role}).returning('*');
            user.id = result.id;
        }else{
            const [result] = await db('users').select('id').where({email: process.env.SUPER_USERNAME});
            user.id=result.id;
        }
        
        await post('user/login', user, (res)=>{
            user.cookies=res.headers['set-cookie'];
        }); 

    }
    testUsers.sort((a,b)=>a.id-b.id);
}

beforeAll( async done => {
    knex = await waitForKnexPromise();
    await insertUsers(knex);
    done();

})

afterAll( () => {
    return closeKnex();
});


describe("Cam", () => {

    it('GET /cam/file for no user fails to fetch', async (done)=>{
        await get('cam/123.m3u8', {}, (res)=>{
            expect(res.statusCode).toEqual(401);
        });
        done();
    });

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
    it('GET /cam/file for super works', async (done)=>{
        const fileToGet = 'blah.m3u8';
        await get('cam/'+fileToGet, {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.text).toEqual(fs.readFileSync(path.join(__dirname,'mockfiles',fileToGet),'utf-8'));
        }, testSuperUser.cookies);
        done();
    });

    it('GET /cam/file with invalid file fails', async (done)=>{
        const fileToGet = 'sdfsdfklafsdk.m3u8';
        await get('cam/'+fileToGet, {}, (res)=>{
            expect(res.statusCode).toEqual(404);
        }, testAdminUser.cookies);
        done();
    });

});