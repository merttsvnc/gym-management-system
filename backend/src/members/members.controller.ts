import { Controller } from '@nestjs/common';
import { MembersService } from './members.service';

@Controller('api/v1/members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}
}

