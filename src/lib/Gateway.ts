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

  public get thinq2_url() {
    return this.data.thinq2Uri + '/';
  }

  public get thinq1_url() {
    return this.data.thinq1Uri + '/';
  }
}
