import {expect,test} from '@playwright/test';

test('complete BIM workspace opens imported models and all business tabs',async({page})=>{
 test.setTimeout(300000);
 const errors:string[]=[];const failed:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&/bim|sxd_bim|facility|cde_/.test(r.url()))failed.push(r.status()+' '+new URL(r.url()).pathname);});
 await page.goto('/bim');
 const heading=page.getByRole('heading',{name:'Mô hình BIM',exact:true});
 const login=page.getByText('Chọn vai trò để đăng nhập ngay',{exact:true});
 await expect(heading.or(login)).toBeVisible();
 if(await login.isVisible()){await login.click();await page.getByText('Chuyên viên',{exact:true}).click();}
 await expect(heading).toBeVisible();
 await expect(page.getByRole('tab',{name:'Không gian mô hình',exact:true})).toBeVisible({timeout:60000});
 await expect(page.getByText(/26077_CIC_NOXH_HVT_/).first()).toBeVisible({timeout:60000});
 await expect(page.locator('.bim-suite canvas').first()).toBeVisible({timeout:60000});
 await expect(page.getByText(/Đang tải "|Đang ghép \d|Mô hình \d+\/12/)).toHaveCount(0,{timeout:240000});
 await expect(page.getByText(/Không mở được|Chưa thể nạp mô hình BIM/)).toHaveCount(0);
 await page.screenshot({path:'../../output/appraisal/qa/bim-full-viewer.png',fullPage:true});
 for(const label of ['Tiến độ','Chi phí','Bền vững','Phương án','Tài sản','Bàn giao','Kiểm tra mô hình','Chất lượng dữ liệu']){
  await page.getByRole('tab',{name:label,exact:true}).click();
  await expect(page.getByRole('tab',{name:label,exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('heading',{name:'Đã xảy ra lỗi',exact:false})).toHaveCount(0);
 }
 await page.getByRole('tab',{name:'Không gian mô hình',exact:true}).click();
 await page.reload();
 await expect(page.getByText(/26077_CIC_NOXH_HVT_/).first()).toBeVisible({timeout:60000});
 await expect(page.locator('.bim-suite canvas').first()).toBeVisible({timeout:60000});
 expect(errors).toEqual([]);
 expect(failed).toEqual([]);
});
