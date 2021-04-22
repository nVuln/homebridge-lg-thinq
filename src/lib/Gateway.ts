export class Gateway {
  constructor(protected data) {}

  public get emp_base_url() {
    return this.data.empTermsUri + '/';
  }

  public get login_base_url() {
    return this.data.empSpxUri + '/';
  }

  public get api_base_url() {
    return this.data.thinq2Uri + '/';
  }
}
