const { JwtService } = require('@nestjs/jwt');

const jwt = new JwtService({
  secret: process.env.JWT_SECRET || 'lab-only-secret',
});

process.stdout.write(
  jwt.sign(
    { sub: '00000000-0000-4000-8000-000000000001', typ: 'access' },
    { expiresIn: '1d' },
  ),
);
