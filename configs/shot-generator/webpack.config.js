const path = require('path')
const webpack = require('webpack')

module.exports = {
  entry: './src/js/windows/shot-generator/window.js',
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, './../../src/build'),
    filename: 'shot-generator.js'
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
    })
  ],
  externals: {
    uws: "uws"
  },
  optimization: {
    minimize: true,
    minimizer: []
  },
  resolve: {
    alias: {
      'events': 'node_modules/events/index.js'
    },
    extensions: ['.js', '.jsx', '.mjs']
  }
}
