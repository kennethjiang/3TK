import babel from 'rollup-plugin-babel';
import babelrc from 'babelrc-rollup';

let pkg = require('./package.json');
let external = Object.keys(pkg.dependencies);

export default {
  entry: 'src/3tk.js',
  plugins: [
    babel(babelrc()),
  ],
  external: external,
  targets: [
    {
      dest: pkg.main,
      format: 'umd',
      moduleName: 'THREETK',
      sourceMap: 'inline'
    },
    {
      dest: pkg.module,
      format: 'es',
      sourceMap: 'inline'
    }
  ]
};
