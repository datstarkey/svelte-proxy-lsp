export interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

export class UserService {
  private users: User[] = [];
  
  constructor(initialUsers: User[] = []) {
    this.users = [...initialUsers];
  }
  
  addUser(user: Omit<User, 'id'>): User {
    const id = Math.max(0, ...this.users.map(u => u.id)) + 1;
    const newUser: User = { ...user, id };
    this.users.push(newUser);
    return newUser;
  }
  
  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }
  
  getAllUsers(): User[] {
    return [...this.users];
  }
  
  updateUser(id: number, updates: Partial<Omit<User, 'id'>>): User | null {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) return null;
    
    this.users[userIndex] = { ...this.users[userIndex], ...updates };
    return this.users[userIndex];
  }
  
  deleteUser(id: number): boolean {
    const initialLength = this.users.length;
    this.users = this.users.filter(user => user.id !== id);
    return this.users.length < initialLength;
  }
  
  getActiveUsers(): User[] {
    return this.users.filter(user => user.isActive);
  }
}

export async function fetchUserData(userId: number): Promise<ApiResponse<User>> {
  // Simulate API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data: {
          id: userId,
          name: 'John Doe',
          email: 'john@example.com',
          isActive: true
        },
        status: 200,
        message: 'Success'
      });
    }, 100);
  });
}

export function formatUserName(user: User): string {
  return `${user.name} (${user.email})`;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}