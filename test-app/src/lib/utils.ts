export interface GreetingOptions {
	prefix?: string;
	enthusiastic?: boolean;
}

export function greetUser(name: string, options: GreetingOptions = {}): string {
	const { prefix = 'Hello', enthusiastic = false } = options;
	const exclamation = enthusiastic ? '!!!' : '!';
	return `${prefix}, ${name}${exclamation}`;
}

export function formatDate(date: Date): string {
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

export class UserManager {
	private users: Array<{ id: number; name: string }> = [];

	addUser(name: string): number {
		const id = this.users.length + 1;
		this.users.push({ id, name });
		return id;
	}

	getUser(id: number) {
		return this.users.find(user => user.id === id);
	}

	getAllUsers() {
		return [...this.users];
	}
}