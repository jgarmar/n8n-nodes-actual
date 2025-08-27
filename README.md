# n8n-nodes-actual

This is a n8n community node. It lets you use Actual in your n8n workflows.

Actual is a local-first personal finance tool. It is 100% free and open-source, written in NodeJS, it has a synchronization element so that all your changes can move between devices without any heavy lifting.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)
[Compatibility](#compatibility)  
[Resources](#resources)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

This node supports the following operations:

### Create Transaction
Create a single transaction in your budget with the following parameters:
- **Account ID**: The ID of the account for the transaction (required)
- **Date**: Transaction date in YYYY-MM-DD format (required)
- **Amount**: Transaction amount in cents - negative for expenses, positive for income (required)
- **Payee**: Name of the payee - will be created if it doesn't exist (optional)
- **Category**: Name of the category - will be created if it doesn't exist (optional)  
- **Category Group**: Name of the category group - used when creating a new category (optional)
- **Notes**: Transaction notes or memo (optional)
- **Cleared**: Whether the transaction is cleared/reconciled (optional, defaults to false)

**Smart Entity Creation**: If the specified payee or category doesn't exist, they will be automatically created. If a category is created and no category group is specified, it will be placed in a "General" group (created if needed).

**Output**: Returns transaction details including:
- Transaction ID of the created transaction
- Information about any newly created payees (with created flag)
- Information about any newly created categories and category groups (with created flags)

**Example Output**:
```json
{
  "transactionId": "abc123-def456-ghi789",
  "createdPayee": {
    "id": "payee123",
    "name": "Coffee Shop",
    "created": true
  },
  "createdCategory": {
    "id": "cat123",
    "name": "Coffee",
    "groupId": "group123", 
    "groupName": "Food & Dining",
    "created": true
  },
  "createdCategoryGroup": {
    "id": "group123",
    "name": "Food & Dining", 
    "created": true
  }
}
```

### Import Transactions
Import a list of transactions into your budget (existing functionality):
- **Account ID**: The ID of the account you are working with (required)
- **Transactions**: JSON array of transactions to import (required)


## Credentials
The URL and the password of your actual server.
E2E budgets are currently **not** supported.


## Compatibility

This was developed for version 1.97.1 of n8n and version 25.6.1 of Actual.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [Actual Budget Website](https://actualbudget.org/)



