const {closeKnex, requestHelper, waitForKnexPromise} =require('./helpers');
const {getHash}=require('../common/common');

//Sets automatically created super user, set these before we require('../app.js') so database isnt seeded yet
process.env.SUPER_PASSWORD = "superpass";
process.env.SUPER_USERNAME = "superuser";
process.env.DOMAIN = 'website.com';

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

const testDevice1 = {name: 'Garage', encro_key:'9a93f3723e03bb3a4f51b6d353982b3847447293149a1e9b706cb9ae876e183c', actions:[{title:'operate', type:'button'}]};
const testDevice2 = {name: 'Stoop',  encro_key:'83204cefe804609e65ffba77a667d97f200b4e1102a7425ea8d0d2dbbdaf697d'};
const testDevices = [testDevice1, testDevice2];

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

async function insertDevices(db){
    for (const device of testDevices){
        const [result]=await db('devices').insert({name: device.name, encro_key: device.encro_key});
        device.id=result.id;
    }
}

beforeAll( async done => {
    knex = await waitForKnexPromise();
    await insertUsers(knex);
    await insertDevices(knex);
    done();

})

afterAll( () => {
    return closeKnex();
});



describe("Devices", () => {

    it('GET /devices/list returns 401/403 for non verified users', async (done)=>{
        await get('devices/list', {}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });
        await get('devices/list', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);
        done();
    });

    it('POST /devices/action returns 401/403 for non verified users', async (done) => {
        await post('devices/action', {}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });
        await post('devices/action', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);
        done();
    });


    it('POST /devices/add|delete|update returns 401/403 for non manager users', async (done)=>{
        const list=['add', 'delete', 'update'];
        for (const i of list){
            await post('devices/'+i, {}, async (res)=>{
                expect(i+String(res.statusCode)).toEqual(i+'401');
            });
            await post('devices/'+i, {}, async (res)=>{
                expect(i+String(res.statusCode)).toEqual(i+'403');
            }, testUnverifiedUser.cookies);    
            await post('devices/'+i, {}, async (res)=>{
                expect(i+String(res.statusCode)).toEqual(i+'403');
            }, testMemberUser.cookies);
        }
        done();
    });    
});