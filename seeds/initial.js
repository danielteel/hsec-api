const {getHash, generateVerificationCode} = require('../common/common');

exports.seed = async function(knex) {
    await knex('user_changeemail').del();
    await knex('user_changepassword').del();
    await knex('users').del();
    await knex('unverified_users').del();
    await knex('crypto').del();

    const superPass = process.env.SUPER_PASSWORD || generateVerificationCode(8);
    const superUser = process.env.SUPER_USERNAME || ('super_'+generateVerificationCode(2));
    if (process.env.FORCE_SQLITE){
        console.log('super username', superUser);
        console.log('super password', superPass);
    }
    await knex('users').insert({email: superUser, pass_hash: getHash(superPass), role: 'super'});
};