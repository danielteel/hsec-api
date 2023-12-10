// Update with your config settings.

module.exports = {

  development: {
    client: 'postgresql',
    connection: {
      host: '127.0.0.1',
      port: 5432,
      database: 'hsec-api',
      user:     'pi',
      password: 'pipass'
    },
  },

  test: {
    client: 'sqlite3',
    connection: ":memory:",
    useNullAsDefault:true
  },

  // production: {
  //   client: 'postgresql',
  //   connection: {
  //     database: 'my_db',
  //     user:     'username',
  //     password: 'password'
  //   },
  //   pool: {
  //     min: 2,
  //     max: 10
  //   },
  //   migrations: {
  //     tableName: 'knex_migrations'
  //   }
  // }

};
