const {getHash, generateVerificationCode} = require('../common/common');

exports.seed = async function(knex) {
    await knex('user_changeemail').del();
    await knex('user_changepassword').del();
    await knex('roles').del();
    await knex('users').del();
    await knex('unverified_users').del();
    await knex('crypto').del();

    const adminPass = generateVerificationCode(8);
    const adminUser = 'admin_'+generateVerificationCode(2);
    console.log('admin credentials');
    console.log('user', adminUser);
    console.log('password', adminPass);

    const roles = await knex('roles').insert([
        {
            rolename: 'admin',
            admin: true,
            manage: true,
            view: true
        },
        {
            rolename: 'manager',
            admin: false,
            manage: true,
            view: true
        },
        {
            rolename: 'member',
            admin: false,
            manage: false,
            view: true
        },
        {
            rolename: 'unverified',
            admin: false,
            manage: false,
            view: false
        }
    ]).returning('*');
    
    const role_id = roles.find(role => role.rolename==='admin').id;
    await knex('users').insert({email: adminUser, pass_hash: getHash(adminPass), role_id});
};