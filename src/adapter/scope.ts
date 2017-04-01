import { ThreadAdapter, ObjectGripAdapter, VariableAdapter } from './index';
import { Scope } from 'vscode-debugadapter';

export interface VariablesProvider {
	variablesProviderId: number;
	threadAdapter: ThreadAdapter;
	isThreadLifetime: boolean;
	getVariables(): Promise<VariableAdapter[]>;
}

export abstract class ScopeAdapter implements VariablesProvider {
	
	public name: string;
	public variablesProviderId: number;
	public thisVariable: VariableAdapter;
	public returnVariable: VariableAdapter;
	public threadAdapter: ThreadAdapter;
	public isThreadLifetime = false;
	
	protected constructor(name: string, threadAdapter: ThreadAdapter) {
		this.threadAdapter = threadAdapter;
		this.name = name;
		this.threadAdapter.registerScopeAdapter(this);
		this.threadAdapter.debugSession.registerVariablesProvider(this);
	}

	public static fromGrip(name: string, grip: FirefoxDebugProtocol.Grip, threadAdapter: ThreadAdapter): ScopeAdapter {
		if ((typeof grip === 'object') && (grip.type === 'object')) {
			return new ObjectScopeAdapter(name, <FirefoxDebugProtocol.ObjectGrip>grip, threadAdapter);
		} else {
			return new SingleValueScopeAdapter(name, grip, threadAdapter);
		}
	}

	public addThis(thisValue: FirefoxDebugProtocol.Grip) {
		this.thisVariable = VariableAdapter.fromGrip('this', thisValue, false, this.threadAdapter);
	}

	public addReturnValue(returnValue: FirefoxDebugProtocol.Grip) {
		this.returnVariable = VariableAdapter.fromGrip('Return value', returnValue, false, this.threadAdapter);
	}

	public getScope(): Scope {
		return new Scope(this.name, this.variablesProviderId);
	}
	
	public async getVariables(): Promise<VariableAdapter[]> {

		let variables = await this.getVariablesInt();

		if (this.thisVariable) {
			variables.unshift(this.thisVariable);
		}

		if (this.returnVariable) {
			variables.unshift(this.returnVariable);
		}

		return variables;
	}

	protected abstract getVariablesInt(): Promise<VariableAdapter[]>;
	
	public getObjectGripAdapters(): ObjectGripAdapter[] {

		let objectGripadapters = this.getObjectGripAdaptersInt();
		if (this.thisVariable && this.thisVariable.objectGripAdapter) {
			objectGripadapters.push(this.thisVariable.objectGripAdapter);
		}
		if (this.returnVariable && this.returnVariable.objectGripAdapter) {
			objectGripadapters.push(this.returnVariable.objectGripAdapter);
		}

		return objectGripadapters;
	}

	protected abstract getObjectGripAdaptersInt(): ObjectGripAdapter[];

	public dispose(): void {
		this.threadAdapter.debugSession.unregisterVariablesProvider(this);
	}
}

export class SingleValueScopeAdapter extends ScopeAdapter {

	private variableAdapter: VariableAdapter;

	public constructor(name: string, grip: FirefoxDebugProtocol.Grip, threadAdapter: ThreadAdapter) {
		super(name, threadAdapter);
		this.variableAdapter = VariableAdapter.fromGrip('', grip, false, threadAdapter);
	}

	protected getVariablesInt(): Promise<VariableAdapter[]> {
		return Promise.resolve([this.variableAdapter]);
	}

	protected getObjectGripAdaptersInt(): ObjectGripAdapter[] {
		let objectGripAdapter = this.variableAdapter.objectGripAdapter;
		return (objectGripAdapter === undefined) ? [] : [objectGripAdapter];
	}
}

export class ObjectScopeAdapter extends ScopeAdapter {

	private objectGripAdapter: ObjectGripAdapter;

	public constructor(name: string, object: FirefoxDebugProtocol.ObjectGrip, threadAdapter: ThreadAdapter) {
		super(name, threadAdapter);
		this.objectGripAdapter = threadAdapter.getOrCreateObjectGripAdapter(object, false);
	}

	protected getVariablesInt(): Promise<VariableAdapter[]> {
		return this.objectGripAdapter.getVariables();
	}

	protected getObjectGripAdaptersInt(): ObjectGripAdapter[] {
		return [this.objectGripAdapter];
	}
}

export class LocalVariablesScopeAdapter extends ScopeAdapter {

	public name: string;
	public variableDescriptors: FirefoxDebugProtocol.PropertyDescriptors;
	public variables: VariableAdapter[] = [];

	public constructor(name: string, variableDescriptors: FirefoxDebugProtocol.PropertyDescriptors, threadAdapter: ThreadAdapter) {
		super(name, threadAdapter);
		this.variableDescriptors = variableDescriptors;

		for (let varname in this.variableDescriptors) {
			this.variables.push(VariableAdapter.fromPropertyDescriptor(
				varname, this.variableDescriptors[varname], false, this.threadAdapter));
		}

		VariableAdapter.sortVariables(this.variables);
	}

	protected getVariablesInt(): Promise<VariableAdapter[]> {
		return Promise.resolve(this.variables);
	}

	protected getObjectGripAdaptersInt(): ObjectGripAdapter[] {
		return <ObjectGripAdapter[]>this.variables
			.map((variableAdapter) => variableAdapter.objectGripAdapter)
			.filter((objectGripAdapter) => (objectGripAdapter !== undefined));
	}
}

export class FunctionScopeAdapter extends ScopeAdapter {

	public name: string;
	public bindings: FirefoxDebugProtocol.FunctionBindings;
	public variables: VariableAdapter[] = [];

	public constructor(name: string, bindings: FirefoxDebugProtocol.FunctionBindings, threadAdapter: ThreadAdapter) {
		super(name, threadAdapter);
		this.bindings = bindings;

		this.bindings.arguments.forEach((arg) => {
			for (let varname in arg) {
				this.variables.push(VariableAdapter.fromPropertyDescriptor(
					varname, arg[varname], false, this.threadAdapter));
			}
		});

		for (let varname in this.bindings.variables) {
			this.variables.push(VariableAdapter.fromPropertyDescriptor(
				varname, this.bindings.variables[varname], false, this.threadAdapter));
		}

		VariableAdapter.sortVariables(this.variables);
	}

	protected getVariablesInt(): Promise<VariableAdapter[]> {
		return Promise.resolve(this.variables);
	}

	protected getObjectGripAdaptersInt(): ObjectGripAdapter[] {
		return <ObjectGripAdapter[]>this.variables
			.map((variableAdapter) => variableAdapter.objectGripAdapter)
			.filter((objectGripAdapter) => (objectGripAdapter !== undefined));
	}
}
