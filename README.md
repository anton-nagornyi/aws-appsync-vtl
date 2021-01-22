# AWS AppSync Resolvers synchronizer

The intention of this package is to make it easier to work with AppSync Velocity templates.
Workflow:
1. Initially pull resolvers with templates:
```
npx aav pull
```
After that folder with resolvers would be created with templates from AppSync. 
2. Make changes to your templates. 
3. Push changes back to AppSync.
```
npx aav push
```  

There are also some tools additional tools. Please use
```
npm aav help
```
to learn more

## Configuration
Create .env file in your project root. Fill it with:

```dotenv
RESOLVERS_PATH=./where/your/reolvers/shoud/be/placed
API_ID=api_id_of_your_appsync
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=aws_region
```
