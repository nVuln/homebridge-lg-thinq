export class Gateway {
  constructor(protected data) {}

  public get emp_base_url() {
    return this.data.empTermsUri + '/';
  }

  public get login_base_url() {
    return this.data.empSpxUri + '/';
  }

  public get thinq2_url() {
    return this.data.thinq2Uri + '/';
  }

  public get thinq1_url() {
    return this.data.thinq1Uri + '/';
  }

  public get country_code() {
    return this.data.countryCode;
  }

  public get language_code() {
    return this.data.languageCode;
  }
}
