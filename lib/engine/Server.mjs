import { execSync, spawn } from 'child_process';
import { inflate } from "node:zlib";
import { logger, read, readParsed } from "../utilities/_index.mjs";
import pngStringify from 'console-png';
import { resolve } from 'path';
import database from './Database.mjs';
import { default as fp } from '../plugins/register.mjs';
import Fastify from "fastify";
import tasker from './Tasker.mjs';
import certificate from "./CertificateGenerator.mjs";


class Server {
    constructor() {
        this.database = database; // raw instance
    }

    async setFastify() {
        this.app = Fastify({
            logger: logger,
            http2: true,
            https: {
                allowHTTP1: true,
                key: this.cert.key,
                cert: this.cert.cert
            }
        });
    }

    async setServerConfig() {
        this.database.core.serverConfig = await readParsed('./assets/database/configs/server.json', true)
    }

    async getApp() {
        return this.app;
    }

    async getDatabase() {
        return this.database;
    }

    async registerPlugins() {
        this.app.register(fp);
    }

    async setContentTypeParser() {

        this.app.removeContentTypeParser("application/json");
        this.app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
            if (req.headers["user-agent"] !== undefined &&
                req.headers['user-agent'].includes(['UnityPlayer' || 'Unity'])) {
                try {
                    inflate(body, function (err, buffer) {
                        if (err && buffer === undefined) {
                            err.statusCode = 404;
                            logger.error(`Buffer is undefined`);
                            return done(err);
                        }
                        const inflatedString = buffer.toString('utf8');
                        if (inflatedString.length > 0) {
                            return done(null, JSON.parse(inflatedString));
                        } else {
                            return done(null);
                        }
                    });
                } catch (error) {
                    error.statusCode = 404;
                    done(error, undefined);
                    return;
                }
            } else {
                try {
                    done(null, JSON.parse(body));
                } catch (error) {
                    error.statusCode = 404;
                    done(error, undefined);
                }
            }

        });


        this.app.addContentTypeParser('*', (req, payload, done) => {
            const chunks = [];
            payload.on('data', chunk => {
                chunks.push(chunk);
            });
            payload.on('end', () => {
                done(null, Buffer.concat(chunks));
            });
        });
    }
    async initializeServer() {
        await Promise.allSettled([
            await this.database.initialize(),
            await tasker.execute(),
            await this.startServer()
        ])
        //.then((results) => results.forEach((result) => logger.info(`${result.status}, ${result.reason}`)));
    }

    async startServer() {
        this.app.listen({
            port: this.database.core.serverConfig.port,
            host: this.database.core.serverConfig.ip
        });
    }

    async registerCertificate() {
        switch (process.platform) {
            case 'win32':
            case 'win64':
                await this.importRootCertWindows();
                break;
            case 'linux':
                logger.warn("Currently we are installing the root SSL certificate via PowerShell. Linux is unavailable at this time!");
                this.cert = await certificate.generate(this.database.core.serverConfig.ip, this.database.core.serverConfig.hostname, 365);
                break;
            default:
                this.cert = await certificate.generate(this.database.core.serverConfig.ip, this.database.core.serverConfig.hostname, 365);
                break;
        }
    }

    async importRootCertWindows() {

        this.cert = await certificate.generate(this.database.core.serverConfig.ip, this.database.core.serverConfig.hostname, 3);

        const clearCertificateScriptPath = resolve('./assets/scripts/clear-certificate.ps1');
        execSync(`powershell.exe -ExecutionPolicy Bypass -File "${clearCertificateScriptPath}"`);

        const installCertificateScriptPath = resolve('./assets/scripts/install-certificate.ps1');
        const installCertificateScript = await read(installCertificateScriptPath, false);
        const installCertificatePowerShell = spawn('powershell', [installCertificateScript]);

        let userCancelOrError = false;
        // Redirect stdout and stderr to our script output.
        let installCertificateScriptOutput = "";
        installCertificatePowerShell.stdout.setEncoding('utf8');
        installCertificatePowerShell.stdout.on('data', function (data) {
            data = data.toString();
            installCertificateScriptOutput += data;
        });

        installCertificatePowerShell.stderr.setEncoding('utf8');
        installCertificatePowerShell.stderr.on('data', function (data) {

            if (data.includes("Get-ChildItem : Cannot find drive")) {
                logger.error(`
                [installCertificatePowerShell.stderr.on]
                Report error below to our GitHub Issues, or on our Discord Bug reports.
                
                `);
                logger.error(data);
                userCancelOrError = true;
            }
            data = data.toString();
            installCertificateScriptOutput += data;
        });

        installCertificatePowerShell.on('close', function (_code) {
            if (userCancelOrError) {
                logger.error(`
                    [HTTPS Certification Installation failed]
                        If an error occured, report on Discord!
                        If you chose not to allow the installation, read below:
                            
                            The certificate is required for Websockets to work, otherwise the Client will not connect to the socket endpoint.
                                If you have any security concerns, you can take a look at the script ${installCertificateScriptPath}.        
                            The certificate is generated on first start, has a lifetime of 3 days, and is saved to /user/certs/.
                
                    [Shutting Down, restart the server and accept certificate installation] 
                `);
            }
        });
    }

    async printLogo() {
        const image = await read(resolve('./assets/templates/webinterface/resources/logo/rs_banner_transparent.png'), false);

        pngStringify(image, function (err, string) {
            if (err) throw err;
            console.log(string);
        });
    }

}

export default new Server;
