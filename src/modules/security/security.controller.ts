import { ApiExcludeController } from '@nestjs/swagger';
import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SecuritySampleDto } from './dto/security-sample.dto';

@ApiExcludeController()
@Public()
@Controller('security')
export class SecurityController {
  @Post('sample')
  sample(@Body() dto: SecuritySampleDto) {
    return { data: { ping: dto.ping } };
  }
}
