export class Session {
  private expiresOn!: number;

  constructor(
    private _accessToken: string,
    private _refreshToken: string,
    private expiresIn: number,
  ) {
    this._refreshToken = _refreshToken;
    this.newToken(_accessToken, expiresIn);
  }

  public newToken(accessToken, expiresIn): void {
    this._accessToken = accessToken;
    this.expiresIn = expiresIn;
  }

  public get accessToken(): string {
    return this._accessToken;
  }

  public get refreshToken(): string {
    return this._refreshToken;
  }

  public hasToken(): boolean {
    return !!this._accessToken;
  }

  public isTokenExpired(): boolean {
    return this.expiresOn < Session.getCurrentEpoch();
  }

  public hasValidToken(): boolean {
    return this.hasToken() && !this.isTokenExpired();
  }

  private static getCurrentEpoch(): number {
    return Math.round(new Date().getTime() / 1000);
  }
}
