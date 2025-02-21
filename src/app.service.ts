import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `<h1>Hello World!</h1>
<h2>This is the API for the Wanna Wanna app — the best grocery list app</h2>

<p>You can find the API documentation <a href="/api">here</a>.</p>

<p>And if you want to know more about the app, visit <a href="https://www.wanna-wanna.com/">https://www.wanna-wanna.com</a>!</p>`;
  }
}
