const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/js/ar/src/index.js',
  output: {
    path: path.resolve(__dirname, './../../src/js/ar/dist'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|mjs)$/,
        exclude: /(node_modules\/(?!peerjs)|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: { electron: require('electron/package.json').version },
                  modules: 'commonjs'
                }
              ],
              '@babel/preset-react'
            ],
            plugins: [
              '@babel/plugin-proposal-class-properties',
              '@babel/plugin-transform-modules-commonjs'
            ]
          }
        }
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          // Creates `style` nodes from JS strings
          'style-loader',
          // Translates CSS into CommonJS
          'css-loader',
          // Compiles Sass to CSS
          'sass-loader',
        ],
      },
      {
        test: /\.glsl$/i,
        use: [
          'raw-loader'
        ],
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  devtool: false, // Disable sourcemaps to prevent errors
  plugins: [
    new webpack.ProvidePlugin({
      'THREE': 'three'
    }),
    new HtmlWebpackPlugin({template: './src/js/ar/src/index.html'})
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.mjs']
  }
}
