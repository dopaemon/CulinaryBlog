import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleLoginCommand } from './commands/google-login.command';
import { ChangePasswordCommand } from './commands/change-password.command';
import { TokenPair } from './commands/issue-tokens';
import { LoginCommand } from './commands/login.command';
import { LoginResult } from './commands/login.handler';
import { LogoutCommand } from './commands/logout.command';
import { RefreshTokenCommand } from './commands/refresh-token.command';
import { RefreshTokenResult } from './commands/refresh-token.handler';
import { RegisterCommand } from './commands/register.command';
import { RegisterResult } from './commands/register.handler';
import { UpdateProfileCommand } from './commands/update-profile.command';
import { RequestPasswordResetCommand } from './commands/request-password-reset.command';
import { ResetPasswordCommand } from './commands/reset-password.command';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MeResult } from './queries/get-me.handler';
import { GetMeQuery } from './queries/get-me.query';

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Ip() ip: string): Promise<RegisterResult> {
    return this.commandBus.execute(new RegisterCommand(dto.email, dto.password, dto.displayName, dto.username, ip));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Ip() ip: string): Promise<LoginResult> {
    return this.commandBus.execute(new LoginCommand(dto.email, dto.password, ip));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto, @Ip() ip: string): Promise<RefreshTokenResult> {
    return this.commandBus.execute(new RefreshTokenCommand(dto.refreshToken, ip));
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: GoogleLoginDto, @Ip() ip: string): Promise<TokenPair> {
    return this.commandBus.execute(new GoogleLoginCommand(dto.idToken, ip));
  }

  @Post('password-reset-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Yêu cầu gửi email đặt lại mật khẩu' })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Yêu cầu đã được tiếp nhận' })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    return this.commandBus.execute(new RequestPasswordResetCommand(dto.email));
  }

  @Put('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng token từ email' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Đặt lại mật khẩu thành công' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Token không hợp lệ hoặc đã hết hạn' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.commandBus.execute(new ResetPasswordCommand(dto.token, dto.newPassword));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshTokenDto): Promise<void> {
    return this.commandBus.execute(new LogoutCommand(user.id, dto.refreshToken));
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResult> {
    return this.queryBus.execute(new GetMeQuery(user.id));
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeResult> {
    return this.commandBus.execute(new UpdateProfileCommand(user.id, dto));
  }

  @Put('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu người dùng hiện tại' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Đổi mật khẩu thành công' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Mật khẩu hiện tại không đúng' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Tài khoản chưa thiết lập mật khẩu' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.commandBus.execute(
      new ChangePasswordCommand(user.id, dto.currentPassword, dto.newPassword),
    );
  }
}
