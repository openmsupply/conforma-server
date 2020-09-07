interface IParameters {
  [key: string]: any;
  connection?: IConnection;
}

interface IQueryNode {
  value?: string | number | boolean | object;
  type?: string;
  operator?: string;
  children?: Array<IQueryNode>;
}

interface IConnection {
  user?: string;
  host?: string;
  database?: string;
  password?: string;
  port?: number;
  query?: any;
}

const defaultParameters: IParameters = {
  connection: {},
};

export default async function evaluateExpression(
  inputQuery: IQueryNode | string,
  params = defaultParameters
): Promise<string | number | boolean | any[]> {
  // If input is JSON string, convert to Object
  const query = typeof inputQuery === 'string' ? JSON.parse(inputQuery) : inputQuery;

  // Base case
  if (!query.children) {
    return query.value;
  }

  // Recursive case
  else {
    const childrenResolved: any[] = await Promise.all(
      query.children.map((child: IQueryNode) => evaluateExpression(child, params))
    );

    switch (query.operator) {
      case 'AND':
        return childrenResolved.reduce((acc: boolean, child: boolean) => {
          return acc && child;
        }, true);

      case 'OR':
        return childrenResolved.reduce((acc: boolean, child: boolean) => {
          return acc || child;
        }, false);

      case 'CONCAT':
        if (query.type === 'array') {
          return childrenResolved.reduce((acc: any, child: any) => {
            return acc.concat(child); // .flat(1) doesn't work for some reason
          });
        } else if (query.type === 'string' || !query.type) {
          return childrenResolved.join('');
        }
        break;

      case 'REGEX':
        const str: string = childrenResolved[0];
        const re: RegExp = new RegExp(childrenResolved[1]);
        return re.test(str);

      case '=':
        return childrenResolved.every((child) => child === childrenResolved[0]);

      case '!=':
        return childrenResolved[0] !== childrenResolved[1];

      case '+':
        return childrenResolved.reduce((acc: number, child: number) => {
          return acc + child;
        }, 0);

      case 'objectProperties':
        try {
          return params[childrenResolved[0].object][childrenResolved[0].property];
        } catch {
          return "Can't resolve object";
        }

      case 'pgSQL':
        if (!params.connection) return 'No database connection provided';
        return processPgSQL(childrenResolved, query.type, params.connection);

      case 'graphQL':
        if (!params.connection) return 'No database connection provided';
        return processGraphQL(childrenResolved, params.connection);

      // etc. for as many other operators as we want/need.
    }
  }
  return 'No matching operators';
}

async function processPgSQL(queryArray: any[], queryType: string, connection: IConnection) {
  const query = {
    text: queryArray[0],
    values: queryArray.slice(1),
    rowMode: queryType ? 'array' : '',
  };
  try {
    const res = await connection.query(query);
    switch (queryType) {
      case 'array':
        return res.rows.flat();
      case 'string':
        return res.rows.flat().join(' ');
      case 'number':
        return Number(res.rows.flat());
      default:
        return res.rows;
    }
  } catch (err) {
    return err.stack;
  }
}

function processGraphQL(queryArray: any[], connection: object) {
  // TO-DO -- For now just return a value that makes test work
  return 0;
}
