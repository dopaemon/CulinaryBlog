export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly displayName: string,
    public readonly username: string,
    public readonly ip?: string,
  ) {}
}
