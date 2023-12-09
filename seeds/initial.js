
exports.seed = async function(knex) {
    await knex('user_changeemail').del();
    await knex('user_changepassword').del();
    await knex('roles').del();
    await knex('users').del();
    await knex('unverified_users').del();
    await knex('crypto').del();


    await knex('roles').insert([
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
        }
    ]);
};