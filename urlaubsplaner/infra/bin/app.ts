import { App } from 'aws-cdk-lib';
import { PlannerStack } from '../lib/planner-stack';

const app = new App();

new PlannerStack(app, 'Urlaubsplaner', {
  // GDPR: everything stays in Frankfurt.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'eu-central-1' },
  domainPrefix: app.node.tryGetContext('domainPrefix') ?? 'feminin-urlaub',
  budgetEmail: app.node.tryGetContext('budgetEmail'),
  mailFrom: app.node.tryGetContext('mailFrom'),
  description: 'Urlaubsplaner der Ordination feminin',
});
