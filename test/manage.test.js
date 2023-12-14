const {mockNodemailer} = require('./mocks/nodemailer');
const {app} = require('../app.js');
const request = require('supertest')(app);
const path = require('path');
const fs=require('fs');


const {closeKnex, requestHelper, getKnex, waitForKnexPromise} =require('./helpers');
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');

const {getHash}=require('../common/common');

let knex = null;


const testUnverifiedUser = {email:'unverified@test.com', roleName: 'unverified', password: 'password', pass_hash: getHash('password')};
const testMemberUser = {email:'view@test.com', roleName: 'member', password: 'password', pass_hash: getHash('password')};
const testManagerUser = {email:'manage@test.com', roleName: 'manager', password: 'password', pass_hash: getHash('password')};
const testAdminUser={email:'admin@test.com', roleName:'admin', password: 'adminpass', pass_hash: getHash('password')};

const testUsers=[testUnverifiedUser, testMemberUser, testManagerUser, testAdminUser].sort((a,b)=>a.id-b.id);


async function insertUsers(db){
    const roles = await db('roles').select('*');

    function getRoleId(name){
        return roles.find(r => r.rolename===name).id;
    }
    function getRolePermissions(role_id){
        const role=roles.find(r => r.id===role_id);
        return {admin: role.admin, manage: role.manage, view: role.view};
    }

    for (const user of testUsers){
        user.pass_hash=getHash(user.password);
        user.role_id = getRoleId(user.roleName);
        const [result] = await db('users').insert({email: user.email, pass_hash: user.pass_hash, role_id: user.role_id}).returning('*');
        user.id = result.id;
        
        await post('user/login', user, (res)=>{
            user.cookies=res.headers['set-cookie'];
        }); 
        const role = getRolePermissions(user.role_id);
        user.admin=role.admin;
        user.manage=role.manage;
        user.view=role.view;
    }
}

beforeAll( async done => {
    knex = await waitForKnexPromise();
    await insertUsers(knex);
    done();

})

afterAll( () => {
    return closeKnex();
});



describe("Manage", () => {

    it('GET /manage/unverified returns 403 when asked by user without manage permissions', async (done)=>{
        await get('manage/unverified', {}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });    
        await get('manage/unverified', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);    
        await get('manage/unverified', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testMemberUser.cookies);
        done();
    });

    it('GET /manage/unverified returns unverified users when asked by user with manage permissions', async (done)=>{
        await get('manage/unverified', {}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([{email: testUnverifiedUser.email, user_id: testUnverifiedUser.id}]);
        }, testManagerUser.cookies);    
        await get('manage/unverified', {}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([{email: testUnverifiedUser.email, user_id: testUnverifiedUser.id}]);
        }, testAdminUser.cookies);
        done();
    });

    it('GET /manage/users returns 401/403 for non manager users', async (done)=>{
        await get('manage/users', {}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });    
        await get('manage/users', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);    
        await get('manage/users', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testMemberUser.cookies);
        done();
    });

    it('GET /manage/users as manager returns all users except admins', async (done)=>{
        await get('manage/users', {}, async (res)=>{
            const usersExpected=testUsers.filter(u => !u.admin).map(u=>({user_id: u.id, email: u.email}));
            res.body.sort((a,b)=>a.user_id-b.user_id);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(usersExpected);
        }, testManagerUser.cookies);  
        done();
    });

    it('GET /manage/users as admin returns all users', async (done)=>{
        await get('manage/users', {}, async (res)=>{
            const usersExpected=testUsers.map(u=>({user_id: u.id, email: u.email}));
            res.body.sort((a,b)=>a.user_id-b.user_id);
            
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(usersExpected);
        }, testAdminUser.cookies);
        done();
    });
});