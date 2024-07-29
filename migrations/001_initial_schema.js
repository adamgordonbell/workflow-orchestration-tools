exports.up = function(knex) {
  return knex.schema
    .createTable('workflow_orchestration_features', function(table) {
      table.increments('id').primary();
      table.string('name', 100).notNullable();
      table.text('description').notNullable();
      table.integer('importance').checkBetween([1, 5]);
    })
    .createTable('workflow_orchestration_tools', function(table) {
      table.increments('id').primary();
      table.string('name', 100).notNullable();
      table.text('description').notNullable();
      table.string('website_url', 255);
      table.boolean('transactional_execution');
      table.boolean('high_performance');
      table.boolean('cloud_scalability');
      table.string('primary_language', 50);
      table.string('status').notNullable();
      table.integer('slot_number').nullable();
      table.timestamp('submitted_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index('status');
      table.index('slot_number');
    })
    .then(function() {
      // Create unique index for active slots
      return knex.schema.raw(`
        CREATE UNIQUE INDEX unique_active_slot
        ON workflow_orchestration_tools (slot_number)
        WHERE status NOT IN ('cancelled', 'rejected');
      `);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('workflow_orchestration_tools')
    .dropTableIfExists('workflow_orchestration_features')
    .then(function() {
      return knex.schema.raw(`
        DROP INDEX IF EXISTS unique_active_slot;
      `);
    });
};
