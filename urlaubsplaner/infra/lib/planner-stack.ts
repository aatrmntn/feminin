// Everything the planner needs on AWS, in eu-central-1 (Frankfurt):
// Cognito login with MFA, DynamoDB tables, one Lambda behind an HTTP API,
// and the web page on S3 + CloudFront. The API is served under the same address (/api/*).
import * as path from 'node:path';
import {
  CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps,
} from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const ROOT = path.join(__dirname, '..', '..');

export interface PlannerStackProps extends StackProps {
  /** Start of the login address: https://<prefix>.auth.eu-central-1.amazoncognito.com */
  domainPrefix: string;
  /** Optional: who gets an email when costs pass 10 USD in a month. */
  budgetEmail?: string;
}

export class PlannerStack extends Stack {
  constructor(scope: Construct, id: string, props: PlannerStackProps) {
    super(scope, id, props);

    // ---------- data ----------
    // Staff data: keep it when the stack is removed, protect it from accidental deletion,
    // and keep 35 days of point-in-time backups.
    const tableDefaults = {
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    };
    const people = new dynamodb.TableV2(this, 'People', {
      ...tableDefaults,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });
    const entries = new dynamodb.TableV2(this, 'Entries', {
      ...tableDefaults,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'byUser',
          partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'start', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'byYear',
          partitionKey: { name: 'startYear', type: dynamodb.AttributeType.NUMBER },
          sortKey: { name: 'start', type: dynamodb.AttributeType.STRING },
        },
      ],
    });
    const settings = new dynamodb.TableV2(this, 'Settings', {
      ...tableDefaults,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });
    const audit = new dynamodb.TableV2(this, 'Audit', {
      ...tableDefaults,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });

    // ---------- login ----------
    // Invite only. Sign-in with a username (not everyone has their own email),
    // password plus an authenticator app (TOTP). No SMS.
    const userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: 'urlaubsplaner',
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      signInCaseSensitive: false,
      standardAttributes: { email: { required: false, mutable: true } },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new cognito.CfnUserPoolGroup(this, 'StaffGroup', {
      userPoolId: userPool.userPoolId, groupName: 'staff', description: 'Team',
    });
    new cognito.CfnUserPoolGroup(this, 'ApproverGroup', {
      userPoolId: userPool.userPoolId, groupName: 'approver', description: 'Genehmigt Urlaub',
    });

    const domain = userPool.addDomain('Login', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // ---------- web page bucket and CDN ----------
    const site = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const loginOrigin = `https://${props.domainPrefix}.auth.${this.region}.amazoncognito.com`;
    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            `connect-src 'self' ${loginOrigin}`,
            "frame-ancestors 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "object-src 'none'",
          ].join('; '),
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true,
        },
      },
    });

    // ---------- API ----------
    const fn = new lambda.Function(this, 'Api', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(ROOT, 'api')),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        PEOPLE_TABLE: people.tableName,
        ENTRIES_TABLE: entries.tableName,
        SETTINGS_TABLE: settings.tableName,
        AUDIT_TABLE: audit.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    people.grantReadWriteData(fn);
    entries.grantReadWriteData(fn);
    settings.grantReadData(fn);
    audit.grant(fn, 'dynamodb:PutItem'); // append only

    const httpApi = new apigw.HttpApi(this, 'HttpApi', { apiName: 'urlaubsplaner' });

    // ---------- CloudFront: page from S3, /api/* to the HTTP API ----------
    const apiHost = Fn.select(2, Fn.split('/', httpApi.apiEndpoint));
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'Urlaubsplaner',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiHost),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
    });
    const appUrl = `https://${distribution.distributionDomainName}/`;

    const client = userPool.addClient('Web', {
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID],
        callbackUrls: [appUrl],
        logoutUrls: [appUrl],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(12),
    });
    // The newer hosted login page needs a style; Cognito's own default is fine.
    new cognito.CfnManagedLoginBranding(this, 'LoginStyle', {
      userPoolId: userPool.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', fn),
      authorizer: new HttpUserPoolAuthorizer('Login', userPool, { userPoolClients: [client] }),
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: site,
      sources: [
        s3deploy.Source.asset(path.join(ROOT, 'web')),
        s3deploy.Source.jsonData('config.json', {
          mode: 'cognito',
          cognitoDomain: domain.baseUrl(),
          clientId: client.userPoolClientId,
        }),
      ],
      distribution,
      distributionPaths: ['/*'],
    });

    // ---------- cost alarm (optional) ----------
    if (props.budgetEmail) {
      new budgets.CfnBudget(this, 'Budget', {
        budget: {
          budgetName: 'urlaubsplaner-monat',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: 10, unit: 'USD' },
        },
        notificationsWithSubscribers: [{
          notification: {
            notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80,
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.budgetEmail }],
        }],
      });
    }

    new CfnOutput(this, 'AppUrl', { value: appUrl, description: 'Adresse des Urlaubsplaners' });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'PeopleTable', { value: people.tableName });
  }
}
