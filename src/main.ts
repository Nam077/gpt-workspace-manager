import { GoogleSheet, User } from './service/google-sheet';
import { chunk, Gpt, UserWorkSpace } from './service/gpt';
import * as csv from 'csv-parser';
import * as fs from 'fs';
import 'dotenv/config';
import * as express from 'express';
import * as process from 'process';

function parseTimeToSeconds(timeString: string): number {
    const regex = /(\d+[Dd])?(\d+[Hh])?(\d+[Mm])?(\d+[Ss])?/; // Mẫu regex để phân tích chuỗi

    const matches = timeString.match(regex);

    if (!matches) {
        throw new Error('Invalid time format');
    }

    const days = parseInt(matches[1]?.replace(/[Dd]/g, '') || '0', 10);
    const hours = parseInt(matches[2]?.replace(/[Hh]/g, '') || '0', 10);
    const minutes = parseInt(matches[3]?.replace(/[Mm]/g, '') || '0', 10);
    const seconds = parseInt(matches[4]?.replace(/[Ss]/g, '') || '0', 10);

    // Chuyển đổi thành giây
    const totalSeconds = days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60 + seconds;

    return totalSeconds * 1000;
}

function findDifference(users: User[], userWorkSpaces: UserWorkSpace[]) {
    return userWorkSpaces.filter((user) => !users.some((u) => u.email === user.email_address));
}

function findDifference2(users: User[], userWorkSpaces: UserWorkSpace[]) {
    return userWorkSpaces.filter((user) => !users.some((u) => u.email === user.email));
}

function removeUserAdmin(userWorkSpaces: UserWorkSpace[], email: string) {
    return userWorkSpaces.filter((user) => user.email_address !== email);
}

function removeUserAdmin2(userWorkSpaces: UserWorkSpace[], email: string) {
    return userWorkSpaces.filter((user) => user.email !== email);
}

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

export interface Cookie {
    email: string;
    cookie: string;
}

async function loadCookie(): Promise<Cookie[]> {
    const filePath = process.env.COOKIE_PATH || './cookies.csv';
    return (await parseCSV(filePath)) as Cookie[];
}

function convertUserToListEmail(users: User[]): string[] {
    return users.map((user) => user.email);
}

export async function processingTask(cookie: Cookie, record: Record<string, User[]>) {
    
    try {
        const gpt = new Gpt();
        const userData = await gpt.getUserInformationByCookie(cookie);
        if (!userData) {
            return;
        }
        console.log('Get user from cookie: ' + userData.user.email);
        const userFromSheetBelongToUserData = record[userData.user.email] || [];
        const mainUsers = await gpt.getListUserFromWorkSpace(userData);
        const pendingUsers = await gpt.getListUserPendingFromWorkSpace(userData);
        pendingUsers
        if (mainUsers === undefined) {
            return;
        }
        
        
        if (pendingUsers === undefined) {
            
            return;
        }
        const redundantMainUsers = removeUserAdmin2(
            findDifference2(userFromSheetBelongToUserData, mainUsers),
            userData.user.email,
        );
        
        const redundantPendingUsers = removeUserAdmin(
            findDifference(userFromSheetBelongToUserData, pendingUsers),
            userData.user.email,
        );
        await gpt.deleteMultiUserFromWorkSpaceUser(userData, redundantMainUsers);
        await gpt.deleteMultiUserFromWorkSpaceInvite(userData, redundantPendingUsers);
    } catch (error) {
        console.log(error);
    }
}

async function getDataFromGoogleSheet(googleSheet: GoogleSheet) {
    console.log('----------Get data from google sheet----------');
    const data = await googleSheet.groupByOwner();
    console.log('----------End get data from google sheet----------\n');
    return data;
}

async function processingMainInvite(cookie: Cookie, record: Record<string, User[]>) {
    try {
        const gpt = new Gpt();
        const userData = await gpt.getUserInformationByCookie(cookie);
        if (!userData) {
            return;
        }
        const userFromSheetBelongToUserData = record[userData.user.email] || [];
        const mainUsers = await gpt.getListUserFromWorkSpace(userData);
        if (mainUsers === undefined) {
            return;
        }
        const pendingUsers = await gpt.getListUserPendingFromWorkSpace(userData);
        if (pendingUsers === undefined) {
            return;
        }
        const lostUsers = findLostUsers(userFromSheetBelongToUserData, mainUsers, pendingUsers);
        const emails = convertUserToListEmail(lostUsers);
        if (emails.length > 0) {
            await gpt.inviteUserToWorkSpace(userData, emails);
        }
    } catch (error) {
        console.log(error);
    }
}

async function runInvite() {
    console.log('----------Inviting user to workspace----------');
    const cookies = await loadCookie();
    const googleSheet = new GoogleSheet();
    await googleSheet.init();
    const record = await getDataFromGoogleSheet(googleSheet);
    if (record === undefined) {
        return
    }
    const task = [];
    for (const cookie of cookies) {
        task.push(processingMainInvite(cookie, record));
    }
    const taskChunks = chunk(task, 10);
    for (const chunk of taskChunks) {
        await Promise.all(chunk);
    }
    console.log('----------End Inviting user to workspace----------\n');
}

async function run() {
    const app = express();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server is running at: http://localhost:${port}
        Invite link: http://localhost:${port}/invite
         `);
    });
    app.get('/invite', async (req, res) => {
        await runInvite();
        res.send('Done');
    });
}

async function runScan() {
    const cookies = await loadCookie();
    const googleSheet = new GoogleSheet();
    await googleSheet.init();
    let record = await getDataFromGoogleSheet(googleSheet);
    if (record === undefined) {
        return;
    }
    // Chạy một lần đầu
    const task = [];
    for (const cookie of cookies) {
        task.push(processingTask(cookie, record));
    }
    const taskChunks = chunk(task, 10);
    for (const chunk of taskChunks) {
        await Promise.all(chunk);
    }

    setInterval(
        async () => {
            record = await getDataFromGoogleSheet(googleSheet);
            const task = [];
            for (const cookie of cookies) {
                task.push(processingTask(cookie, record));
            }
            await Promise.all(task);
        },
        parseTimeToSeconds(process.env.CHECK_TIME || '5m'),
    );
}
async function runSafely() {
    const check = true;
    while (check) {
        try {
            await Promise.all([run(), runScan()]);
            break; // Nếu không có lỗi, thoát khỏi vòng lặp
        } catch (error) {
            console.error('Đã xảy ra lỗi, khởi động lại...', error);
            // Tùy chọn: Thêm một khoảng thời gian chờ trước khi khởi động lại
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

runSafely();