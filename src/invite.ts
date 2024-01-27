import { GoogleSheet, User } from './service/google-sheet';
import { Gpt, UserWorkSpace, chunk } from './service/gpt';
import * as csv from 'csv-parser';
import * as fs from 'fs';
import 'dotenv/config';
import * as express from 'express';

function findLostUsers(users: User[], userWorkSpaces: UserWorkSpace[], pendingUsers: UserWorkSpace[]) {
    return users.filter(
        (user) =>
            !userWorkSpaces.some((u) => u.email === user.email) &&
            !pendingUsers.some((u) => u.email_address === user.email),
    );
}

async function parseCSV(filePath: string): Promise<any[]> {
    const results: any[] = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

function convertUserToListEmail(users: User[]): string[] {
    return users.map((user) => user.email);
}

async function processingTask(cookie: string, record: Record<string, User[]>) {
    try {
        const gpt = new Gpt();
        const userData = await gpt.getUserInformationByCookie(cookie);
        console.log('Get user from cookie: ' + userData.user.email);
        const userFromSheetBelongToUserData = record[userData.user.email] || [];
        const mainUsers = await gpt.getListUserFromWorkSpace(userData);
        const pendingUsers = await gpt.getListUserPendingFromWorkSpace(userData);
        const lostUsers = findLostUsers(userFromSheetBelongToUserData, mainUsers, pendingUsers);
        const emails = convertUserToListEmail(lostUsers);
        if (emails.length > 0) {
            await gpt.inviteUserToWorkSpace(userData, emails);
        }
    } catch (error) {
        console.log(error);
    }
}

async function getDataFromGoogleSheet(googleSheet: GoogleSheet) {
    console.log('Get data from google sheet');

    return await googleSheet.groupByOwner();
}

async function runServer() {
    const app = express();
    app.listen(3000, () => {
        console.log(`Server is running at: http://localhost:3000\n
        Invite link: http://localhost:3000/invite
         `);
    });
    app.get('/invite', async (req, res) => {
        await startApp();
        res.send('Done');
    });
}

async function startApp() {
    const cookies = await parseCSV('./cookies.csv');
    const googleSheet = new GoogleSheet();
    await googleSheet.init();
    const record = await getDataFromGoogleSheet(googleSheet);
    const task = [];
    for (const cookie of cookies) {
        task.push(processingTask(cookie.cookie, record));
    }
    const taskChunks = chunk(task, 10);
    for (const chunk of taskChunks) {
        await Promise.all(chunk);
    }
}

runServer();
