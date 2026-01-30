import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SignupTokenGuard extends AuthGuard('signup-token') {}
