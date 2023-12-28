process.env.SUPER_PASSWORD = "superpass";//Sets automatically created super user, set these before we require('../app.js') so database isnt seeded yet
process.env.SUPER_USERNAME = "superuser";
process.env.DOMAIN = 'website.com';

const {app} = require('../app.js');
const {closeKnex, requestHelper, waitForKnexPromise} =require('./helpers.js');
const {getHash}=require('../common/common.js');
const {mockNodemailer} = require('./mocks/nodemailer.js');
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

    it("POST /user/create creates a user and sends a confirmation email", async (done) => {
        const newUser = {email: 'testtest@gmail.com'};
        await post('user/create', newUser, async (res)=>{
            
            expect(res.statusCode).toEqual(201);
            expect(res.body).toEqual({email: newUser.email});
            
            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(newUser.email);
            expect(mockNodemailer.sent[0].text).toContain('Email confirmation code ');
            const [{confirmation_code: confirmCode}] = await knex('unverified_users').select('confirmation_code').where({email: newUser.email});
            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/verifysignup/'+newUser.email+'/'+confirmCode+'">Click to confirm email</a>');
        });
        done();
    });    

    it("POST /user/create confirming create account by email", async (done) => {
        const newUser = {email: 'testtest@gmail.com'};
        const confirmCode = await post('user/create', newUser, async (res)=>{
            const [{confirmation_code: code}] = await knex('unverified_users').select('confirmation_code').where({email: newUser.email});
            expect(code).not.toBeNull();
            return code;
        });

        //Wrong confirmation code
        await post('user/verifyemail', {confirmCode: '132kl3kjl1nm', email: newUser.email, password: '1qaz!QAZ'}, async (res) => {
            expect(res.statusCode).toEqual(400);
        });

        
        //Illegal password
        await post('user/verifyemail', {confirmCode, email: newUser.email, password: '1qaz!QA'}, async (res) => {
            expect(res.statusCode).toEqual(400);
        });

        //Illegal email
        await post('user/verifyemail', {confirmCode, email: 'asdlisdfksldjf', password: '1qaz!QA'}, async (res) => {
            expect(res.statusCode).toEqual(400);
        });

        //Actually verify
        await post('user/verifyemail', {confirmCode, email: newUser.email, password: '1qaz!QAZ'}, async (res) => {
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

    it('POST /user/login fails when bad credentials', async done => {
        await post('user/login', {email: testMemberUser.email, password: testMemberUser.password+'123123'}, res=>{
            expect(res.statusCode).toEqual(400);
        });
        await post('user/login', {email: 'abc'+testMemberUser.email, password: testMemberUser.password}, res=>{
            expect(res.statusCode).toEqual(400);
        });
        done();
    });

    it('POST /user/login sets credential cookies', async done => {
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

    
    it('GET /user/me returns details of user from cookies', async (done)=>{
        for (const user of testUsers){
            await get('user/me', {}, (res)=>{
                expect(res.statusCode).toEqual(200);
                expect(res.body).toEqual({id: user.id, email: user.email, role: user.role});
            }, user.cookies);
        }
        done();
    });


    it('POST /user/forgotstart and /user/forgotend', async done => {
        const confirmCode = await post('user/forgotstart', {email: testMemberUser.email}, async res => {
            expect(res.statusCode).toEqual(200);
            expect(res.body.status).toEqual('check email');
            
            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testMemberUser.email);
            expect(mockNodemailer.sent[0].text).toContain('confirmation code is');
            const [{confirmation_code: confirmCode}] = await knex('user_changepassword').select('confirmation_code').where({user_id: testMemberUser.id});
            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/verifyforgot/'+testMemberUser.email+'/'+confirmCode+'">Click here</a>');
            return confirmCode;
        });

        const newPassword = testMemberUser.password+'123!@#AbC';

        //Invalid email
        await post('user/forgotend', {email: testMemberUser.email+'a', confirmCode: confirmCode, newPassword}, res=>{
            expect(res.statusCode).toEqual(400);
        });
        //Invalid confirm code
        await post('user/forgotend', {email: testMemberUser.email, confirmCode: confirmCode+'a', newPassword}, res=>{
            expect(res.statusCode).toEqual(400);
        });
        //Illegal password
        await post('user/forgotend', {email: testMemberUser.email, confirmCode: confirmCode, newPassword: '1qaz4$'}, res=>{
            expect(res.statusCode).toEqual(400);
        });


        await post('user/forgotend', {email: testMemberUser.email, confirmCode: confirmCode, newPassword}, res=>{
            expect(res.statusCode).toEqual(200);
            testMemberUser.password=newPassword;
            testMemberUser.pass_hash=getHash(newPassword);
        });
        done();
    });

    it('POST /user/changemailstart and /user/changemailend', async done => {
        const newEmail = 'newemail@newemail.com';


        await get('user/changemailstatus', {}, async res=>{
            expect(res.statusCode).toEqual(401);
        });

        await get('user/changemailstatus', {}, async res=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body.status).toEqual('none');
        }, testMemberUser.cookies);
        
        //not logged in
        await post('user/changemailstart', {newEmail, password: testMemberUser.password}, async res => {
            expect(res.statusCode).toEqual(401);
        });    

        //wrong password
        await post('user/changemailstart', {newEmail, password: testMemberUser.password+'a'}, async res => {
            expect(res.statusCode).toEqual(400);
        }, testMemberUser.cookies);

        //invalid email password
        await post('user/changemailstart', {newEmail: '1@2.', password: testMemberUser.password+'a'}, async res => {
            expect(res.statusCode).toEqual(400);
        }, testMemberUser.cookies);

        const confirmCode = await post('user/changemailstart', {newEmail, password: testMemberUser.password}, async res => {
            expect(res.statusCode).toEqual(200);
            
            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(newEmail);
            expect(mockNodemailer.sent[0].text).toContain('confirmation code is');
            const [{confirmation_code: confirmCode}] = await knex('user_changeemail').select('confirmation_code').where({user_id: testMemberUser.id});
            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/changemailend/'+testMemberUser.email+'/'+confirmCode+'">Click here</a>');
            return confirmCode;
        }, testMemberUser.cookies);


        await get('user/changemailstatus', {}, async res=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body.status).toEqual('confirm');
            expect(res.body.newEmail).toEqual(newEmail);
        }, testMemberUser.cookies);

        //not logged in
        await post('user/changemailend', {confirmCode}, async res => {
            expect(res.statusCode).toEqual(401)
        });

        //invalid confirm code
        await post('user/changemailend', {confirmCode: confirmCode+'a'}, async res => {
            expect(res.statusCode).toEqual(400)
        }, testMemberUser.cookies);
        //Different user
        await post('user/changemailend', {confirmCode: confirmCode+'a'}, async res => {
            expect(res.statusCode).toEqual(400)
        }, testAdminUser.cookies);


        await post('user/changemailend', {confirmCode}, async res => {
            expect(res.statusCode).toEqual(200);
    
            const [{id: userId}] = await knex('users').select('id').where({email: newEmail});

            expect(testMemberUser.id).toEqual(userId);
            
            const [record] = await knex('user_changeemail').select('*').where({user_id: testMemberUser.id});
            expect(record).toEqual(undefined);
            testMemberUser.email=newEmail;

        }, testMemberUser.cookies);
        
        await get('user/changemailstatus', {}, async res=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body.status).toEqual('none');
        }, testMemberUser.cookies);
        
        done();
    });

    it('POST /user/logouteverywhere changes the session in the users record', async done => {
        
        await get('user/me', {}, async res=>{
            expect(res.statusCode).toEqual(200);
        }, testMemberUser.cookies);

        const [{session: oldSession}] = await knex('users').select('*').where({id: testMemberUser.id});
  
        await post('user/logouteverywhere', {}, async res=>{
            expect(res.statusCode).toEqual(200);
        }, testMemberUser.cookies);

        await get('user/me', {}, async res=>{
            expect(res.statusCode).toEqual(401);
        }, testMemberUser.cookies);
        
        const [{session: newSession}] = await knex('users').select('*').where({id: testMemberUser.id});

        expect(oldSession).not.toEqual(newSession);
        done();
    });
});
