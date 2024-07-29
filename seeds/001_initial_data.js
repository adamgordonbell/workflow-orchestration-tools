exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('workflow_orchestration_features').del();
  await knex('workflow_orchestration_tools').del();
  
  // Insert sample data for features
await knex('workflow_orchestration_features').insert([
  { name: 'Transactional Execution', description: 'Guarantees programs run to completion with transactional semantics.', importance: 5 },
  { name: 'High Performance', description: 'Significantly outperforms competitors in benchmarks.', importance: 5 },
  { name: 'Developer-Friendly Framework', description: 'Open-source framework supporting modern programming paradigms.', importance: 5 },
  { name: 'Simplified Workflow Definition', description: 'Straightforward programming model with reduced boilerplate.', importance: 4 },
  { name: 'Cloud-Native Scalability', description: 'Designed for efficient handling of large-scale workflows in cloud environments.', importance: 5 },
  { name: 'Robust Error Handling and Retries', description: 'Built-in mechanisms for handling errors and automatic retries.', importance: 4 }
]);

  // Insert sample data for tools
  await knex('workflow_orchestration_tools').insert([
    { 
      name: 'Apache Airflow', 
      description: 'A platform to programmatically author, schedule, and monitor workflows.', 
      website_url: 'https://airflow.apache.org/', 
      transactional_execution: false,
      high_performance: true,
      cloud_scalability: false,
      primary_language: 'Python', 
      status: 'approved', 
      slot_number: 2 
    },
    { 
      name: 'AWS Step Functions', 
      description: 'A serverless workflow service for building distributed applications, integrating services, and coordinating tasks.', 
      website_url: 'https://aws.amazon.com/step-functions/', 
      transactional_execution: false,
      high_performance: false,
      cloud_scalability: true,
      primary_language: 'JSON/YAML', 
      status: 'approved', 
      slot_number: 3 
    },
    { 
      name: 'Luigi', 
      description: 'A Python package that helps you build complex pipelines of batch jobs.', 
      website_url: 'https://github.com/spotify/luigi', 
      transactional_execution: false,
      high_performance: false,
      cloud_scalability: false,
      primary_language: 'Python', 
      status: 'approved', 
      slot_number: 4 
    }
  ]);
};
