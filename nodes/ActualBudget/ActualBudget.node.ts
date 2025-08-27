import {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

interface Credentials {
	url: string;
	password: string;
}

interface TransactionData {
	date: string;
	amount: number;
	accountId: string;
	payee?: string;
	category?: string;
	categoryGroup?: string;
	notes?: string;
	cleared?: boolean;
}

interface TransactionResult {
	transactionId: string;
	createdPayee?: {
		id: string;
		name: string;
		created: boolean;
	};
	createdCategory?: {
		id: string;
		name: string;
		groupId: string;
		groupName: string;
		created: boolean;
	};
	createdCategoryGroup?: {
		id: string;
		name: string;
		created: boolean;
	};
}

export class ActualBudget implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ActualBudget',
		name: 'actualBudget',
		icon: 'file:actualbudget.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + " " + $parameter["resource"]}}',
		description: 'Consume ActualBudget API',
		defaults: {
			name: 'ActualBudget',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'actualBudgetApi',
				required: true,
			},
		],

		properties: [
			{
				displayName: 'Budget ID',
				description: 'The ID of the Budget you are working on/with',
				name: 'budgetId',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Create Transaction',
						value: 'createTransaction',
						action: 'Create a single transaction in your budget',
					},
					{
						name: 'Import Transactions',
						value: 'importTransactions',
						action: 'Import a list of transactions into your budget',
					},
				],
				default: 'createTransaction',
				required: true,
				noDataExpression: true,
			},
			{
				displayName: 'Account ID',
				description: 'The ID of the Account you are working on/with',
				name: 'accountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['importTransactions'],
					},
				},
				required: true,
			},
			{
				displayName: 'Transactions',
				name: 'transactions',
				type: 'json',
				default: '[]',
				displayOptions: {
					show: {
						operation: ['importTransactions'],
					},
				},
				required: true,
			},
			// Create Transaction parameters
			{
				displayName: 'Account ID',
				description: 'The ID of the Account for the transaction',
				name: 'transactionAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
				required: true,
			},
			{
				displayName: 'Date',
				description: 'Transaction date (YYYY-MM-DD format)',
				name: 'date',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
				required: true,
			},
			{
				displayName: 'Amount',
				description: 'Transaction amount in cents (negative for expenses, positive for income)',
				name: 'amount',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
				required: true,
			},
			{
				displayName: 'Payee',
				description: 'Name of the payee (will be created if it does not exist)',
				name: 'payee',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
			},
			{
				displayName: 'Category',
				description: 'Name of the category (will be created if it does not exist)',
				name: 'category',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
			},
			{
				displayName: 'Category Group',
				description: 'Name of the category group (used when creating a new category)',
				name: 'categoryGroup',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
			},
			{
				displayName: 'Notes',
				description: 'Transaction notes or memo',
				name: 'notes',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
			},
			{
				displayName: 'Cleared',
				description: 'Whether the transaction is cleared/reconciled',
				name: 'cleared',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['createTransaction'],
					},
				},
			},
		],
	};

	methods = {
		listSearch: {
			searchBudget: async function (
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const auth = (await this.getCredentials('actualBudgetApi', 0)) as Credentials;
				const actual = await initializeActualBudget(auth);

				let budgets = actual.getBudgets();
				console.debug(filter, budgets);

				if (filter !== undefined && filter !== '') {
					budgets = budgets.filter((budget: any) =>
						budget.name.toLowerCase().includes(filter.toLowerCase()),
					);
				}

				await actual.shutdown();

				return {
					results: budgets.map((budget: any) => ({
						name: budget.name,
						value: budget.cloudFileId,
						url: '',
					})),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		const action = this.getNodeParameter('operation', 0) as string;
		const auth = (await this.getCredentials('actualBudgetApi', 0)) as Credentials;
		const actual = await initializeActualBudget(auth);

		const budgetId = this.getNodeParameter('budgetId', 0) as string;

		await actual.downloadBudget(budgetId);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let elementData;
				switch (action) {
					case 'createTransaction':
						elementData = await handleCreateTransaction(this, actual, itemIndex);
						returnData.push(elementData);
						break;
					case 'importTransactions':
						elementData = await handleBudgetImport(this, actual, itemIndex);
						returnData.push(elementData);
						break;
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray({ error: error.message }),
						{ itemData: { item: itemIndex } },
					);
					returnData.push(...executionData);
					continue;
				}
				await actual.shutdown();
				throw error;
			}
		}

		await actual.shutdown();
		return [this.helpers.returnJsonArray(returnData)];
	}
}

async function initializeActualBudget(auth: Credentials): Promise<any> {
	const actual = require('@actual-app/api');

	await actual.init({
		serverURL: auth.url,
		password: auth.password,
	});

	return actual;
}

async function handleBudgetImport(
	context: IExecuteFunctions,
	actual: any,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = context.getNodeParameter('accountId', itemIndex) as string;
	const transactions = context.getNodeParameter('transactions', itemIndex);

	return actual.importTransactions(accountId, transactions) as IDataObject;
}

async function handleCreateTransaction(
	context: IExecuteFunctions,
	actual: any,
	itemIndex: number,
): Promise<IDataObject> {
	// Get transaction parameters
	const transactionData: TransactionData = {
		date: context.getNodeParameter('date', itemIndex) as string,
		amount: context.getNodeParameter('amount', itemIndex) as number,
		accountId: context.getNodeParameter('transactionAccountId', itemIndex) as string,
		payee: context.getNodeParameter('payee', itemIndex, '') as string,
		category: context.getNodeParameter('category', itemIndex, '') as string,
		categoryGroup: context.getNodeParameter('categoryGroup', itemIndex, '') as string,
		notes: context.getNodeParameter('notes', itemIndex, '') as string,
		cleared: context.getNodeParameter('cleared', itemIndex, false) as boolean,
	};

	// Validate transaction data
	validateTransactionData(transactionData);

	const result: TransactionResult = {
		transactionId: '',
	};

	// Handle payee creation/retrieval
	let payeeId: string | undefined;
	if (transactionData.payee && transactionData.payee.trim() !== '') {
		const payeeResult = await getOrCreatePayee(actual, transactionData.payee);
		payeeId = payeeResult.id;
		result.createdPayee = payeeResult;
	}

	// Handle category creation/retrieval
	let categoryId: string | undefined;
	if (transactionData.category && transactionData.category.trim() !== '') {
		const categoryResult = await getOrCreateCategory(
			actual,
			transactionData.category,
			transactionData.categoryGroup,
		);
		categoryId = categoryResult.category.id;
		result.createdCategory = categoryResult.category;
		if (categoryResult.categoryGroup) {
			result.createdCategoryGroup = categoryResult.categoryGroup;
		}
	}

	// Create the transaction
	const transactionId = await actual.addTransaction(transactionData.accountId, {
		date: transactionData.date,
		amount: transactionData.amount,
		payee: payeeId,
		category: categoryId,
		notes: transactionData.notes,
		cleared: transactionData.cleared,
	});

	result.transactionId = transactionId;

	return result as unknown as IDataObject;
}

function validateTransactionData(data: TransactionData): void {
	// Validate date format (YYYY-MM-DD)
	const datePattern = /^\d{4}-\d{2}-\d{2}$/;
	if (!datePattern.test(data.date)) {
		throw new NodeOperationError(
			{} as any,
			'Date must be in YYYY-MM-DD format',
		);
	}

	// Validate date is a valid date
	const parsedDate = new Date(data.date);
	if (isNaN(parsedDate.getTime())) {
		throw new NodeOperationError(
			{} as any,
			'Invalid date provided',
		);
	}

	// Validate amount is a number
	if (typeof data.amount !== 'number' || isNaN(data.amount)) {
		throw new NodeOperationError(
			{} as any,
			'Amount must be a valid number',
		);
	}

	// Validate account ID
	if (!data.accountId || data.accountId.trim() === '') {
		throw new NodeOperationError(
			{} as any,
			'Account ID is required',
		);
	}

	// If category is provided but category group is not, warn about default group
	if (data.category && data.category.trim() !== '' && 
	    (!data.categoryGroup || data.categoryGroup.trim() === '')) {
		console.warn('Category provided without category group. Will use default group if category needs to be created.');
	}
}

async function getOrCreatePayee(
	actual: any,
	payeeName: string,
): Promise<{ id: string; name: string; created: boolean }> {
	// Get all payees
	const payees = await actual.getPayees();
	
	// Check if payee already exists
	const existingPayee = payees.find(
		(p: any) => p.name.toLowerCase() === payeeName.toLowerCase(),
	);

	if (existingPayee) {
		return {
			id: existingPayee.id,
			name: existingPayee.name,
			created: false,
		};
	}

	// Create new payee
	const newPayeeId = await actual.createPayee({ name: payeeName });
	
	return {
		id: newPayeeId,
		name: payeeName,
		created: true,
	};
}

async function getOrCreateCategory(
	actual: any,
	categoryName: string,
	categoryGroupName?: string,
): Promise<{
	category: { id: string; name: string; groupId: string; groupName: string; created: boolean };
	categoryGroup?: { id: string; name: string; created: boolean };
}> {
	// Get all categories
	const categories = await actual.getCategories();
	
	// Check if category already exists
	const existingCategory = categories.find(
		(c: any) => c.name.toLowerCase() === categoryName.toLowerCase(),
	);

	if (existingCategory) {
		const categoryGroup = categories.find((c: any) => c.id === existingCategory.cat_group);
		return {
			category: {
				id: existingCategory.id,
				name: existingCategory.name,
				groupId: existingCategory.cat_group,
				groupName: categoryGroup?.name || 'Unknown',
				created: false,
			},
		};
	}

	// Category doesn't exist, need to create it
	let groupId: string;
	let groupResult: { id: string; name: string; created: boolean } | undefined;

	if (categoryGroupName && categoryGroupName.trim() !== '') {
		// Try to find existing category group
		const categoryGroups = await actual.getCategoryGroups();
		const existingGroup = categoryGroups.find(
			(g: any) => g.name.toLowerCase() === categoryGroupName.toLowerCase(),
		);

		if (existingGroup) {
			groupId = existingGroup.id;
			groupResult = {
				id: existingGroup.id,
				name: existingGroup.name,
				created: false,
			};
		} else {
			// Create new category group
			const newGroupId = await actual.createCategoryGroup({ name: categoryGroupName });
			groupId = newGroupId;
			groupResult = {
				id: newGroupId,
				name: categoryGroupName,
				created: true,
			};
		}
	} else {
		// Use default category group or create one
		const categoryGroups = await actual.getCategoryGroups();
		const defaultGroup = categoryGroups.find(
			(g: any) => g.name.toLowerCase() === 'general' || g.name.toLowerCase() === 'default',
		);

		if (defaultGroup) {
			groupId = defaultGroup.id;
		} else {
			// Create a "General" category group
			const newGroupId = await actual.createCategoryGroup({ name: 'General' });
			groupId = newGroupId;
			groupResult = {
				id: newGroupId,
				name: 'General',
				created: true,
			};
		}
	}

	// Create new category
	const newCategoryId = await actual.createCategory({ 
		name: categoryName, 
		cat_group: groupId 
	});
	
	return {
		category: {
			id: newCategoryId,
			name: categoryName,
			groupId: groupId,
			groupName: groupResult?.name || categoryGroupName || 'General',
			created: true,
		},
		categoryGroup: groupResult,
	};
}
