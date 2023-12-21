exports.up = function(knex) {
    knex.schema.createTable('crypto', table => {
        table.increments('id');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.string('crypto_id').unique().notNullable();
        table.string('publicKey', 1000);
        table.string('privateKey', 4000);
        table.string('passphrase');
    }).then( () => {} );

    knex.schema.createTable('formats', table => {
        table.increments('id');
        table.string('type').checkIn(['hls', 'jpg']);
        table.string('file').unique().notNullable();
        table.string('title').unique().notNullable();
        table.integer('w').notNullable();
        table.integer('h').notNullable();
        table.integer('qual');
        table.float('fps').notNullable();
        table.float('block');
    }).then( () => {});

    knex.schema.createTable('unverified_users', table => {
        table.increments('id');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.string('email').unique().notNullable();
        table.string('pass_hash');
        table.string('verification_code');
    }).then( () => {} );

    knex.schema.createTable('users', table => {
        table.increments('id');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.string('email').unique().notNullable();
        table.integer('session').defaultTo(0);
        table.string('pass_hash');
        table.string('role').checkIn(['super', 'admin', 'manager', 'member', 'unverified']);
    }).then( () => {} );

    knex.schema.createTable('user_changepassword', table => {
        table.increments('id');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.string('confirmation_code').notNullable();
        table.integer('user_id').unique().notNullable();
        
        table.foreign('user_id').references('id').inTable('users');
    }).then( () => {} );
    
    return knex.schema.createTable('user_changeemail', table => {
        table.increments('id');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.integer('user_id').unique().notNullable();
        table.string('step').defaultTo('verifyOld');
        table.string('current_verification_code');
        table.string('new_email').notNullable();

        table.foreign('user_id').references('id').inTable('users');
    });
};

exports.down = function(knex) {
    knex.schema.dropTableIfExists('crypto').then(()=>{});
    knex.schema.dropTableIfExists('formats').then(()=>{});
    knex.schema.dropTableIfExists('unverified_users').then(()=>{});
    knex.schema.dropTableIfExists('users').then(()=>{});
    knex.schema.dropTableIfExists('user_changepassword').then(()=>{});
    return knex.schema.dropTableIfExists('user_changeemail');
};