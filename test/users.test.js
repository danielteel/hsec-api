process.env.SUPER_PASSWORD = "superpass";//Sets automatically created super user, set these before we require('../app.js') so database isnt seeded yet
process.env.SUPER_USERNAME = "superuser";
process.env.DOMAIN = 'website.com';

const {app} = require('../app.js');
const {closeKnex, requestHelper, waitForKnexPromise} =require('./helpers.js');
const {getHash}=require('../common/common.js');
const {mockNodemailer} = require('./mocks/nodemailer.js');
const { getTestMessageUrl } = require('nodemailer');
const request = require('supertest')(app);
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');
const {decryptAccessToken} = require('../common/accessToken.js');


const testSuperUser =       {email: process.env.SUPER_USERNAME, password: process.env.SUPER_PASSWORD, role: 'super'};
const testUnverifiedUser =  {email:'unverified@test.com',       password: 'password',                 role: 'unverified'};
const testMemberUser =      {email:'view@test.com',             password: 'password',                 role: 'member'};
const testManagerUser =     {email:'manage@test.com',           password: 'password',                 role: 'manager'};
const testAdminUser =       {email:'admin@test.com',            password: 'adminpass',                role: 'admin'};
const testUsers=[testSuperUser, testUnverifiedUser, testMemberUser, testManagerUser, testAdminUser];

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

beforeEach( async done => {
    mockNodemailer.clear();
    await knex('users').delete().whereNotIn('id', testUsers.map(u => u.id));
    await knex('unverified_users').delete();
    await knex('user_changepassword').delete();
    await knex('user_changeemail').delete();
    done();
});

describe("USers", ()=>{

    it("POST /user/create fails with invalid inputs", async (done)=>{
        const badEmails = [123, 'abc@gmail', '@gmail.com', 'cats.'];

        for (const badEmail of badEmails){
            await post('user/create', {email: badEmail}, async (res)=>{
                expect(res.statusCode).toEqual(400);
            });
        }

        done();
    });

    it("POST /user/create creates a user and sends a verification email", async (done) => {
        const newUser = {email: 'testtest@gmail.com'};
        await post('user/create', newUser, async (res)=>{
            
            expect(res.statusCode).toEqual(201);
            expect(res.body).toEqual({email: newUser.email});
            
            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(newUser.email);
            expect(mockNodemailer.sent[0].text).toContain('Email verification pin ');
            const [{verification_code: verifyCode}] = await knex('unverified_users').select('verification_code').where({email: newUser.email});
            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/verifysignup/'+newUser.email+'/'+verifyCode+'">Click to confirm email</a>');
        });
        done();
    });    

    it("POST /user/create verifying create account by email", async (done) => {
        const newUser = {email: 'testtest@gmail.com'};
        const verificationCode = await post('user/create', newUser, async (res)=>{
            const [{verification_code: code}] = await knex('unverified_users').select('verification_code').where({email: newUser.email});
            expect(code).not.toBeNull();
            return code;
        });

        //Wrong verification code
        await post('user/verifyemail', {verifyCode: '132kl3kjl1nm', email: newUser.email, password: '1qaz!QAZ'}, async (res) => {
            expect(res.statusCode).toEqual(400);
        });

        
        //Illegal password
        await post('user/verifyemail', {verifyCode: verificationCode, email: newUser.email, password: '1qaz!QA'}, async (res) => {
            expect(res.statusCode).toEqual(400);
        });

        //Illegal email
        await post('user/verifyemail', {verifyCode: verificationCode, email: 'asdlisdfksldjf', password: '1qaz!QA'}, async (res) => {
            expect(res.statusCode).toEqual(400);
        });

        //Actually verify
        await post('user/verifyemail', {verifyCode: verificationCode, email: newUser.email, password: '1qaz!QAZ'}, async (res) => {
            const accessToken = decodeURIComponent(res.headers['set-cookie'][0].split('=')[1].split(';')[0]);
            const hashcess = decodeURIComponent(res.headers['set-cookie'][1].split('=')[1].split(';')[0]);
            const decryptedAccessToken = decryptAccessToken(accessToken);
            const [{id: userId}] = await knex('users').select('id').where({email: newUser.email});
            expect(typeof userId).toEqual('number');
            expect(hashcess).toEqual(getHash(decryptedAccessToken.hashcess));
            expect(res.statusCode).toEqual(200);
            expect(decryptedAccessToken.id).toEqual(userId);
        });
        done();
    });    

    it('POST /user/login sets cookie credentials', async done => {
        await post('user/login', testMemberUser, (res)=>{
            expect(res.headers['set-cookie'][0]).not.toContain('Expires=');
            expect(res.headers['set-cookie'][1]).not.toContain('Expires=');
            const accessToken = decodeURIComponent(res.headers['set-cookie'][0].split('=')[1].split(';')[0]);
            const hashcess = decodeURIComponent(res.headers['set-cookie'][1].split('=')[1].split(';')[0]);
            const decryptedAccessToken = decryptAccessToken(accessToken);

            expect(hashcess).toEqual(getHash(decryptedAccessToken.hashcess));
            expect(res.statusCode).toEqual(200);
            expect(decryptedAccessToken.id).toEqual(testMemberUser.id);
        }); 

        await post('user/login', {...testMemberUser, remember: true}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.headers['set-cookie'][0]).toContain('Expires=');
            expect(res.headers['set-cookie'][1]).toContain('Expires=');
        }); 
        done();
    });

    it('POST /user/logout deletes cookies', async done => {
        await post('user/logout', {}, (res)=>{
            expect(res.headers['set-cookie'][0]).toContain('accessToken=;');
            expect(res.headers['set-cookie'][1]).toContain('hashcess=;');
            expect(res.statusCode).toEqual(200);
        }, testMemberUser.cookies); 
        done();
    });
});
