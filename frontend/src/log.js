export function createLog(environment) {
  return (stage, data = {}) => {
    if (environment === 'production') return;
    console.log(JSON.stringify({ stage, ...data }));
  };
}
